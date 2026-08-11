#!/usr/bin/env node
/**
 * Builds repos.meta.json: YC company metadata for every repository in
 * repos.txt, keyed by "owner/repo".
 *
 * repos.txt stays the human-editable source of truth. This script enriches it
 * with the company facts the UI cares about — chiefly whether the company is
 * hiring, which is the reason to contribute to a YC company specifically
 * rather than to any open source project.
 *
 * Repositories that cannot be matched to a YC company are simply omitted; the
 * UI renders them without badges.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/build-repo-metadata.mjs
 */

import fs from 'node:fs';

const YC_ALL = 'https://yc-oss.github.io/api/companies/all.json';
const GITHUB_API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yc-github-issues-metadata'
};

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
 * Fetches JSON from the GitHub API.
 * @param {string} url Absolute URL
 * @returns {Promise<any|null>} Parsed body, or null when unavailable
 */
async function gh(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000;
      const waitMs = Math.max(reset - Date.now(), 5000);

      console.error(`  rate limited, waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitMs));

      return gh(url);
    }

    return null;
  }

  return response.json();
}

async function main() {
  const repoUrls = fs
    .readFileSync('repos.txt', 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  console.error(`Loading YC company directory from ${YC_ALL}`);

  const companies = await fetch(YC_ALL).then(response => response.json());

  // Index companies by website domain, which is what we can match a GitHub org
  // against. Name matching is unsafe: unrelated orgs share common names.
  const byDomain = new Map();

  for (const company of companies) {
    const domain = domainOf(company.website);

    if (domain && !byDomain.has(domain)) {
      byDomain.set(domain, company);
    }
  }

  console.error(`${companies.length} companies indexed by domain\n`);

  const metadata = {};
  const orgCache = new Map();
  let matched = 0;

  for (const url of repoUrls) {
    const match = url.match(/github\.com\/([^/]+)\/([^/#?]+)/);

    if (!match) continue;

    const [, owner, rawRepo] = match;
    const repo = rawRepo.replace(/\.git$/, '');
    const fullName = `${owner}/${repo}`;

    if (!orgCache.has(owner)) {
      const org =
        (await gh(`${GITHUB_API}/orgs/${owner}`)) ?? (await gh(`${GITHUB_API}/users/${owner}`));

      orgCache.set(owner, org);
    }

    const org = orgCache.get(owner);
    const company = org ? byDomain.get(domainOf(org.blog)) : null;

    if (!company) {
      console.error(`  no YC match: ${fullName}`);
      continue;
    }

    matched++;
    metadata[fullName] = {
      name: company.name,
      batch: company.batch,
      is_hiring: Boolean(company.isHiring),
      team_size: company.team_size ?? null,
      stage: company.stage ?? null,
      yc_url: company.url ?? null
    };

    console.error(
      `  ${fullName} -> ${company.name} (${company.batch})${company.isHiring ? ' [hiring]' : ''}`
    );
  }

  fs.writeFileSync('repos.meta.json', JSON.stringify(metadata, null, 2) + '\n');

  const hiring = Object.values(metadata).filter(entry => entry.is_hiring).length;

  console.error(`\nMatched ${matched}/${repoUrls.length} repos to a YC company.`);
  console.error(`${hiring} are at companies currently hiring.`);
  console.error('Wrote repos.meta.json');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
