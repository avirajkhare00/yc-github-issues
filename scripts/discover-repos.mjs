#!/usr/bin/env node
/**
 * Discovers GitHub repositories belonging to YC-backed companies.
 *
 * Company names come from the yc-oss/api dataset (a mirror of YC's public
 * directory, every batch). That dataset has no GitHub field, so each company
 * is resolved to an org by matching the org's website against the company's
 * website — a name match alone is far too weak, since names like "Apollo" or
 * "Mux" collide with unrelated orgs.
 *
 * Everything goes through GraphQL in batches: a REST crawl of ~6,000
 * companies costs hours of rate limit, this costs a few hundred points.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/discover-repos.mjs \
 *     [--min-stars 100] [--out repos.candidates.txt] [--orgs-out yc-orgs.json]
 */

import fs from 'node:fs';

const YC_ALL = 'https://yc-oss.github.io/api/companies/all.json';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const MIN_STARS = Number(getArg('--min-stars', '100'));
const OUT_FILE = getArg('--out', 'repos.candidates.txt');
const ORGS_FILE = getArg('--orgs-out', 'yc-orgs.json');
const TOKEN = process.env.GITHUB_TOKEN;

// Companies per search query, and owners per repository query. One search
// query of 20 costs a single point; repository queries are heavier because
// each owner returns a page of repos.
const SEARCH_BATCH = 20;
const REPO_BATCH = 10;

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required.');
  process.exit(1);
}

/**
 * Runs a GraphQL query, waiting out rate limits. Missing logins come back as
 * NOT_FOUND errors alongside partial data, which is expected and ignored.
 * @param {string} query GraphQL document
 * @returns {Promise<object|null>} The data, or null if the query failed
 */
async function graphql(query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'yc-github-issues-discovery'
      },
      body: JSON.stringify({ query })
    });

    const body = response.ok ? await response.json() : null;
    const rateLimited =
      response.status === 403 ||
      response.status === 429 ||
      body?.errors?.some(error => error.type === 'RATE_LIMITED');

    if (rateLimited) {
      const reset = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
      const waitMs = Math.min(Math.max(reset - Date.now(), 60_000), 15 * 60 * 1000);

      console.error(`  rate limited, waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!body?.data) {
      console.error(`  GraphQL failed: HTTP ${response.status} ${JSON.stringify(body?.errors ?? '').slice(0, 200)}`);
      return null;
    }

    const unexpected = (body.errors ?? []).filter(error => error.type !== 'NOT_FOUND');

    if (unexpected.length > 0) {
      console.error(`  GraphQL partial errors: ${JSON.stringify(unexpected).slice(0, 200)}`);
    }

    return body.data;
  }

  return null;
}

/**
 * Reduces a URL to a comparable hostname.
 * @param {string} url Any URL or hostname
 * @returns {string} Bare domain, or '' if unparseable
 */
function domainOf(url) {
  if (!url) return '';

  try {
    const withScheme = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Generates plausible GitHub logins for a company name. Search finds most
 * orgs; these catch the ones whose name GitHub search ranks poorly.
 * @param {object} company YC company record
 * @returns {string[]} Candidate logins
 */
function candidateLogins(company) {
  const base = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dashed = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fromDomain = domainOf(company.website).split('.')[0];

  return [...new Set([company.slug, base, dashed, fromDomain].filter(Boolean))];
}

// Fields every owner lookup needs to confirm a match
const OWNER_FIELDS = '... on Organization { login websiteUrl } ... on User { login websiteUrl }';

/**
 * Resolves a batch of companies to GitHub owners in one query. A candidate
 * counts only when its stated website matches the company's.
 * @param {object[]} companies YC company records
 * @returns {Promise<{matches: Map<string, string[]>, failed: boolean}>} Logins by company slug
 */
async function resolveBatch(companies) {
  const fields = companies.flatMap((company, i) => {
    // Search syntax treats punctuation as qualifiers, so keep words only
    const words = company.name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const search = `s${i}: search(query: ${JSON.stringify(`${words} type:org`)}, type: USER, first: 10) { nodes { ${OWNER_FIELDS} } }`;
    const guesses = candidateLogins(company).map(
      (login, j) => `g${i}_${j}: repositoryOwner(login: ${JSON.stringify(login)}) { ${OWNER_FIELDS} }`
    );

    return [search, ...guesses];
  });

  const data = await graphql(`{ ${fields.join('\n')} }`);
  const matches = new Map();

  if (!data) return { matches, failed: true };

  companies.forEach((company, i) => {
    const domain = domainOf(company.website);
    const candidates = [
      ...(data[`s${i}`]?.nodes ?? []),
      ...Object.entries(data)
        .filter(([key]) => key.startsWith(`g${i}_`))
        .map(([, owner]) => owner)
    ];
    const logins = new Set(
      candidates
        .filter(owner => owner?.login && domain && domainOf(owner.websiteUrl) === domain)
        .map(owner => owner.login)
    );

    if (logins.size > 0) matches.set(company.slug, [...logins]);
  });

  return { matches, failed: false };
}

/**
 * Lists the repos worth showing contributors for a batch of owners, with
 * their open "good first issue" counts.
 * @param {string[]} logins GitHub owners
 * @returns {Promise<object[]|null>} Candidate repos, or null if the query failed
 */
async function reposBatch(logins) {
  const fields = logins.map(
    (login, i) => `o${i}: repositoryOwner(login: ${JSON.stringify(login)}) {
      repositories(first: 50, privacy: PUBLIC, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
        nodes {
          nameWithOwner stargazerCount isArchived isDisabled hasIssuesEnabled
          issues(states: OPEN, labels: ["good first issue"]) { totalCount }
        }
      }
    }`
  );

  const data = await graphql(`{ ${fields.join('\n')} }`);

  if (!data) return null;

  return Object.values(data)
    .flatMap(owner => owner?.repositories?.nodes ?? [])
    .filter(
      repo =>
        !repo.isArchived &&
        !repo.isDisabled &&
        repo.hasIssuesEnabled &&
        repo.stargazerCount >= MIN_STARS
    );
}

/**
 * Splits an array into chunks.
 * @param {any[]} items Items to split
 * @param {number} size Chunk size
 * @returns {any[][]} Chunks
 */
const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function main() {
  console.error(`Fetching YC companies from ${YC_ALL}`);

  const all = await fetch(YC_ALL).then(response => response.json());

  const companies = all.filter(company => company.website);

  console.error(`${companies.length} of ${all.length} companies have a website\n`);

  const orgs = {};
  let failedBatches = 0;
  const companyBatches = chunk(companies, SEARCH_BATCH);

  for (const [index, batch] of companyBatches.entries()) {
    const { matches, failed } = await resolveBatch(batch);

    if (failed) failedBatches++;

    for (const company of batch) {
      if (matches.has(company.slug)) {
        orgs[company.slug] = {
          name: company.name,
          batch: company.batch,
          status: company.status,
          github: matches.get(company.slug)
        };
      }
    }

    if ((index + 1) % 25 === 0) {
      console.error(`  [${index + 1}/${companyBatches.length}] ${Object.keys(orgs).length} companies resolved`);
    }
  }

  fs.writeFileSync(ORGS_FILE, JSON.stringify(orgs, null, 2) + '\n');
  console.error(`\nResolved ${Object.keys(orgs).length}/${companies.length} companies to GitHub; wrote ${ORGS_FILE}`);

  // The map covers every YC company, but only ones still operating
  // independently can hire: an acquired company's org belongs to its acquirer
  // and an inactive one's is a dead end. A rename can claim the same org twice.
  const owners = [
    ...new Set(
      Object.values(orgs)
        .filter(entry => entry.status === 'Active' || entry.status === 'Public')
        .flatMap(entry => entry.github)
    )
  ];

  console.error(`Listing repos for ${owners.length} owners at active or public companies`);

  const found = [];
  let failedRepoBatches = 0;
  const ownerBatches = chunk(owners, REPO_BATCH);

  for (const batch of ownerBatches) {
    const repos = await reposBatch(batch);

    if (!repos) {
      failedRepoBatches++;
      continue;
    }

    for (const repo of repos) {
      const count = repo.issues.totalCount;

      if (count > 0) {
        found.push({ repo: repo.nameWithOwner, stars: repo.stargazerCount, count });
      }
    }
  }

  found.sort((a, b) => b.count - a.count || b.stars - a.stars);

  const lines = found.map(entry => `https://github.com/${entry.repo}`);

  fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n');
  console.error(`Wrote ${lines.length} repos (${MIN_STARS}+ stars, open good first issues) to ${OUT_FILE}`);

  // A large share of failed queries means the result is incomplete, not that
  // YC ran out of open source. Exit non-zero so the workflow surfaces it
  // instead of opening a pull request that quietly drops repos.
  const failureRate =
    (failedBatches + failedRepoBatches) / Math.max(1, companyBatches.length + ownerBatches.length);

  if (failureRate > 0.1) {
    console.error(`\n${Math.round(failureRate * 100)}% of queries failed — this is a failure, not a result.`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
