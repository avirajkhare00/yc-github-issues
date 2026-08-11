#!/usr/bin/env node
/**
 * Discovers GitHub repositories belonging to YC-backed open source companies.
 *
 * Company names come from the yc-oss/api dataset (a mirror of YC's public
 * directory). That dataset has no GitHub field, so each company is resolved to
 * an org by matching the org's website against the company's website — a name
 * match alone is far too weak, since names like "Apollo" or "Mux" collide with
 * unrelated orgs.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/discover-repos.mjs [--min-stars 500] [--out repos.candidates.txt]
 */

import fs from 'node:fs';

const YC_OPEN_SOURCE = 'https://yc-oss.github.io/api/tags/open-source.json';
const GITHUB_API = 'https://api.github.com';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const MIN_STARS = Number(getArg('--min-stars', '500'));
const OUT_FILE = getArg('--out', 'repos.candidates.txt');
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required (5,000 req/hr; this script needs a few hundred).');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yc-github-issues-discovery'
};

/**
 * Fetches JSON from the GitHub API, respecting rate limits.
 * @param {string} url Absolute URL
 * @returns {Promise<any|null>} Parsed body, or null on 404
 */
// Anything that went wrong, so a run that silently finds nothing can be
// diagnosed from its own output instead of by guessing.
const failures = [];

async function gh(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const body = await response.text();

      // A 403 with quota left is a permission denial, not a rate limit.
      // Retrying it just burns the clock, and waiting for a "reset" that is
      // not coming would hang the job.
      if (remaining !== '0' && /not accessible|forbidden/i.test(body)) {
        failures.push({ url, status: 403, reason: 'permission denied' });
        console.error(`  403 permission denied: ${url}`);
        return null;
      }

      const reset = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
      const waitMs = Math.min(Math.max(reset - Date.now(), 5000), 15 * 60 * 1000);

      console.error(`  rate limited (remaining=${remaining}), waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      failures.push({ url, status: response.status, reason: response.statusText });
      console.error(`  HTTP ${response.status} ${response.statusText}: ${url}`);
      return null;
    }

    return response.json();
  }

  failures.push({ url, status: 0, reason: 'retries exhausted' });
  console.error(`  gave up after 3 attempts: ${url}`);

  return null;
}

/**
 * Reduces a URL to a comparable registrable domain.
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
 * Generates plausible GitHub org logins for a company name.
 * @param {object} company YC company record
 * @returns {string[]} Candidate logins, most likely first
 */
function candidateLogins(company) {
  const base = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dashed = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fromDomain = domainOf(company.website).split('.')[0];

  return [...new Set([company.slug, base, dashed, fromDomain].filter(Boolean))];
}

/**
 * Resolves a company to a GitHub org, requiring the org's website to match the
 * company's. Returns null when no candidate can be confirmed.
 * @param {object} company YC company record
 * @returns {Promise<string|null>} Org login
 */
async function resolveOrg(company) {
  const companyDomain = domainOf(company.website);

  for (const login of candidateLogins(company)) {
    const org = await gh(`${GITHUB_API}/orgs/${encodeURIComponent(login)}`);

    if (!org) continue;

    const orgDomain = domainOf(org.blog);

    // The org's stated website must match the company's. This is what keeps
    // unrelated same-name orgs out of the list.
    if (orgDomain && companyDomain && orgDomain === companyDomain) {
      return org.login;
    }
  }

  return null;
}

/**
 * Lists an org's public repos that are worth showing to contributors.
 * @param {string} org Org login
 * @returns {Promise<object[]>} Candidate repos
 */
async function candidateRepos(org) {
  const repos = await gh(`${GITHUB_API}/orgs/${org}/repos?per_page=100&sort=updated`);

  if (!Array.isArray(repos)) return [];

  return repos.filter(
    repo =>
      !repo.fork &&
      !repo.archived &&
      !repo.disabled &&
      repo.has_issues &&
      repo.stargazers_count >= MIN_STARS
  );
}

/**
 * Counts open "good first issue" items in a repo.
 * @param {object} repo Repo record
 * @returns {Promise<number>} Number of matching open issues (capped at 100)
 */
async function goodFirstIssueCount(repo) {
  const url =
    `${GITHUB_API}/repos/${repo.full_name}/issues` +
    `?state=open&labels=${encodeURIComponent('good first issue')}&per_page=100`;
  const issues = await gh(url);

  return Array.isArray(issues) ? issues.length : 0;
}

async function main() {
  console.error(`Fetching YC open-source companies from ${YC_OPEN_SOURCE}`);

  const companies = await fetch(YC_OPEN_SOURCE).then(response => response.json());

  console.error(`${companies.length} companies tagged "Open Source"\n`);

  const found = [];
  let resolved = 0;

  for (const [index, company] of companies.entries()) {
    const progress = `[${index + 1}/${companies.length}]`;
    const org = await resolveOrg(company);

    if (!org) continue;

    resolved++;

    const repos = await candidateRepos(org);

    for (const repo of repos) {
      const count = await goodFirstIssueCount(repo);

      if (count > 0) {
        found.push({ company: company.name, repo: repo.full_name, stars: repo.stargazers_count, count });
        console.error(
          `${progress} ${company.name} -> ${repo.full_name} ` +
            `(${repo.stargazers_count}* , ${count} good first issues)`
        );
      }
    }
  }

  found.sort((a, b) => b.count - a.count || b.stars - a.stars);

  const lines = found.map(entry => `https://github.com/${entry.repo}`);

  fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n');

  console.error(`\nResolved ${resolved}/${companies.length} companies to a GitHub org.`);
  console.error(`Wrote ${lines.length} repos with open good first issues to ${OUT_FILE}`);

  if (failures.length > 0) {
    const byReason = failures.reduce((counts, failure) => {
      const key = `${failure.status} ${failure.reason}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});

    console.error(`\n${failures.length} API calls failed:`);
    for (const [reason, count] of Object.entries(byReason)) {
      console.error(`  ${count}x ${reason}`);
    }
  }

  // Resolving orgs but finding almost no repos means the repo or issue
  // endpoints were failing, not that YC ran out of open source. Exit non-zero
  // so the workflow surfaces it instead of opening a no-op pull request.
  if (resolved > 10 && lines.length < resolved / 10) {
    console.error(
      `\nOnly ${lines.length} repos from ${resolved} resolved orgs — this is a failure, not a result.`
    );
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
