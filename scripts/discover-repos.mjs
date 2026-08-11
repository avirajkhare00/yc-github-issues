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
async function gh(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    // Primary or secondary rate limit: wait for the window and retry
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
      const waitMs = Math.max(reset - Date.now(), 5000);

      console.error(`  rate limited, waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

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
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
