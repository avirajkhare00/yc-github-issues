import { NextResponse } from 'next/server';
import { getParsedRepositories } from '@/app/utils/repoUtils';
import { fetchIssuesForRepo, Issue } from '@/app/services/githubService';
import { mapWithConcurrency } from '@/app/utils/async';

// How many repositories to fetch at the same time. High enough to keep the
// page fast, low enough to stay clear of GitHub's secondary rate limits.
const CONCURRENCY = 8;

// How long a successful response is reused before we hit GitHub again
const CACHE_TTL_SECONDS = 15 * 60;

// A partial result is retried sooner, so a transient failure doesn't leave
// repositories missing for the full TTL
const DEGRADED_CACHE_TTL_SECONDS = 60;

// How long a shared cache may keep serving a stale response while it
// revalidates in the background
const STALE_WHILE_REVALIDATE_SECONDS = 60 * 60;

// Floor between forced refreshes. Each one costs a full round of GitHub calls,
// so this stops the refresh button from being held down.
const MIN_REFRESH_INTERVAL_MS = 60 * 1000;

interface CachedResponse {
  issues: Issue[];
  fetchedAt: string;
  // True when some repositories failed and the list is missing their issues
  degraded: boolean;
}

let cache: CachedResponse | null = null;
let cacheExpiresAt = 0;
let lastFetchedAt = 0;
// In-flight request shared by concurrent callers so a cold cache only
// triggers one round of GitHub calls
let inFlight: Promise<CachedResponse> | null = null;

/**
 * Fetches issues for every configured repository, in parallel.
 * @returns The issues and the time they were fetched
 */
async function fetchAllIssues(): Promise<CachedResponse> {
  const repositories = getParsedRepositories();

  const results = await mapWithConcurrency(repositories, CONCURRENCY, ({ owner, repo }) =>
    fetchIssuesForRepo(owner, repo)
  );

  const failedCount = results.filter(result => result.failed).length;

  // Every repository failing means GitHub is down or we are rate limited, not
  // that there is nothing to show. Throw so we serve stale data instead of
  // caching an empty list for the full TTL.
  if (repositories.length > 0 && failedCount === repositories.length) {
    throw new Error(`All ${failedCount} repository fetches failed`);
  }

  if (failedCount > 0) {
    console.warn(`${failedCount} of ${repositories.length} repository fetches failed`);
  }

  return {
    issues: results.flatMap(result => result.issues),
    fetchedAt: new Date().toISOString(),
    degraded: failedCount > 0
  };
}

/**
 * Returns the cached issues, refreshing them if the cache has expired.
 * Concurrent misses share a single refresh.
 * @returns The issues, and whether they came from the cache
 */
async function getIssues(
  forceRefresh: boolean
): Promise<{ response: CachedResponse; cached: boolean }> {
  // A forced refresh skips the cache, but no more often than the floor allows
  const refreshAllowed = forceRefresh && Date.now() - lastFetchedAt > MIN_REFRESH_INTERVAL_MS;

  if (cache && Date.now() < cacheExpiresAt && !refreshAllowed) {
    return { response: cache, cached: true };
  }

  if (!inFlight) {
    inFlight = fetchAllIssues()
      .then(result => {
        const ttl = result.degraded ? DEGRADED_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

        cache = result;
        lastFetchedAt = Date.now();
        cacheExpiresAt = lastFetchedAt + ttl * 1000;

        return result;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return { response: await inFlight, cached: false };
}

/**
 * Builds the shared-cache header for a response. The in-memory cache is
 * per-instance, so this is what stops GitHub traffic from scaling with the
 * number of running instances.
 * @param degraded Whether the response is missing some repositories
 * @returns Cache-Control header value
 */
function cacheControl(degraded: boolean): string {
  const maxAge = degraded ? DEGRADED_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

  return `public, s-maxage=${maxAge}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;
}

export async function GET(request: Request) {
  const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';

  try {
    const { response, cached } = await getIssues(forceRefresh);

    return NextResponse.json(
      { ...response, cached },
      {
        headers: {
          // A refresh must not be served from, or written to, a shared cache
          'Cache-Control': forceRefresh ? 'no-store' : cacheControl(response.degraded)
        }
      }
    );
  } catch (error) {
    console.error('Error fetching issues:', error);

    // Serve stale data rather than an error page if we have any
    if (cache) {
      return NextResponse.json(
        { ...cache, cached: true, stale: true },
        { headers: { 'Cache-Control': cacheControl(true) } }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
