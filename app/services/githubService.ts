import { Octokit } from 'octokit';

// Get GitHub token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Initialize Octokit with auth token if available.
//
// Octokit's throttling plugin sleeps until the rate limit window resets by
// default, which for an exhausted unauthenticated quota can be the better part
// of an hour — the request would hang rather than fail. We'd much rather fail
// fast and let the route serve stale data, so retries are declined.
const octokit = new Octokit({
  ...(GITHUB_TOKEN ? { auth: GITHUB_TOKEN } : {}),
  throttle: {
    onRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
      console.warn(`Rate limited on ${options.method} ${options.url} (resets in ${retryAfter}s)`);
      return false;
    },
    onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
      console.warn(`Secondary rate limit on ${options.method} ${options.url}`);
      return false;
    }
  }
});

// Log whether we're using authenticated requests
console.log(`GitHub API: ${GITHUB_TOKEN ? 'Using authenticated requests (5,000 req/hr)' : 'Using unauthenticated requests (60 req/hr)'}`);


// The shape the UI actually renders. GitHub returns ~37 fields per issue
// (including the full body); we project down to these before caching or
// sending anything to the client.
export interface Issue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
  user: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  repository_name: string;
  is_pull_request: boolean;
  // An already-assigned issue is effectively taken, so the UI can hide them
  is_assigned: boolean;
  comments: number;
  // Primary language of the repository, not the issue
  language: string | null;
}

// The issue shape as GitHub returns it, narrowed to the fields we read
type GitHubIssue = Awaited<
  ReturnType<typeof octokit.rest.issues.listForRepo>
>['data'][number];

/**
 * Projects a GitHub issue down to the fields the UI renders
 * @param issue Issue as returned by the GitHub API
 * @param repositoryName Full "owner/repo" name
 * @returns Trimmed issue
 */
function toIssue(issue: GitHubIssue, repositoryName: string, language: string | null): Issue {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    updated_at: issue.updated_at,
    labels: issue.labels.map(label =>
      typeof label === 'string'
        ? { name: label, color: 'cccccc' }
        : { name: label.name ?? '', color: label.color ?? 'cccccc' }
    ),
    user: {
      login: issue.user?.login ?? 'unknown',
      avatar_url: issue.user?.avatar_url ?? '',
      html_url: issue.user?.html_url ?? ''
    },
    repository_name: repositoryName,
    // GitHub's issues endpoint also returns pull requests; they carry this key
    is_pull_request: issue.pull_request !== undefined,
    is_assigned: Boolean(issue.assignee) || (issue.assignees?.length ?? 0) > 0,
    comments: issue.comments,
    language
  };
}

/**
 * Fetches open issues from a GitHub repository
 * @param owner Repository owner
 * @param repo Repository name
 * @param options Label filter and page size
 * @returns Array of issues
 */
async function fetchIssues(
  owner: string,
  repo: string,
  options: { labels?: string; perPage: number; language: string | null }
): Promise<Issue[]> {
  const response = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    ...(options.labels ? { labels: options.labels } : {}),
    per_page: options.perPage,
    sort: 'updated',
    direction: 'desc'
  });

  return response.data.map(issue => toIssue(issue, `${owner}/${repo}`, options.language));
}

/**
 * Looks up a repository's primary language.
 * @param owner Repository owner
 * @param repo Repository name
 * @returns The language, or null if unknown
 */
async function fetchLanguage(owner: string, repo: string): Promise<string | null> {
  const response = await octokit.rest.repos.get({ owner, repo });

  return response.data.language ?? null;
}

// A repository that genuinely has no open issues and one whose fetch failed
// both yield an empty list, so callers need to be able to tell them apart —
// otherwise a rate-limited fetch looks like a successful empty result.
export interface RepoIssues {
  issues: Issue[];
  failed: boolean;
}

/**
 * Fetches the issues to display for a single repository: good first issues if
 * there are any, otherwise the most recently active ones.
 * @param owner Repository owner
 * @param repo Repository name
 * @returns The repository's issues, and whether the fetch failed
 */
export async function fetchIssuesForRepo(owner: string, repo: string): Promise<RepoIssues> {
  try {
    // The language lookup is independent of the issues, so run it alongside
    // rather than paying for an extra sequential round-trip.
    // Limit to 10 issues per repo to avoid rate limits
    const [language, goodFirstIssues] = await Promise.all([
      fetchLanguage(owner, repo),
      fetchIssues(owner, repo, { labels: 'good first issue', perPage: 10, language: null })
    ]);

    if (goodFirstIssues.length > 0) {
      return {
        issues: goodFirstIssues.map(issue => ({ ...issue, language })),
        failed: false
      };
    }

    // No good first issues, fall back to the most recently active ones
    return {
      issues: await fetchIssues(owner, repo, { perPage: 5, language }),
      failed: false
    };
  } catch (error) {
    console.error(`Error fetching issues for ${owner}/${repo}:`, error);
    return { issues: [], failed: true };
  }
}
