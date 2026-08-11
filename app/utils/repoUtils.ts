import fs from 'fs';
import path from 'path';

export interface Repository {
  owner: string;
  repo: string;
}

// YC company facts, keyed by "owner/repo". Built by
// scripts/build-repo-metadata.mjs; see repos.meta.json.
export interface CompanyMeta {
  name: string;
  batch: string;
  is_hiring: boolean;
  team_size: number | null;
  stage: string | null;
  yc_url: string | null;
}

/**
 * Reads the YC company metadata that accompanies repos.txt.
 * @returns Metadata keyed by "owner/repo"; empty when the file is absent
 */
export function getCompanyMetadata(): Record<string, CompanyMeta> {
  const metadataPath = path.join(process.cwd(), 'repos.meta.json');

  // Unlike repos.txt this file is optional: without it the UI simply renders
  // no company badges, which is a degraded view rather than a broken one.
  if (!fs.existsSync(metadataPath)) {
    console.warn('repos.meta.json not found; company badges will be hidden');
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    console.error('Could not parse repos.meta.json:', error);
    return {};
  }
}

/**
 * Reads the repositories from the repos.txt file
 * @returns Array of repository URLs
 */
export function getRepositories(): string[] {
  // Deliberately not caught: an unreadable repos.txt is a deployment problem,
  // and returning an empty list here would look like "no issues found" and get
  // cached as a successful result.
  const reposFilePath = path.join(process.cwd(), 'repos.txt');
  const content = fs.readFileSync(reposFilePath, 'utf8');

  // Split by newlines and filter out empty lines
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Extracts owner and repo name from a GitHub repository URL
 * @param repoUrl GitHub repository URL
 * @returns Object containing owner and repo name
 */
export function parseRepoUrl(repoUrl: string): Repository | null {
  try {
    // Handle URLs like https://github.com/owner/repo, including clone URLs
    // (trailing .git) and links with a trailing slash or extra path segments
    const urlPattern = /github\.com[/:]([^/]+)\/([^/#?]+)/;
    const match = repoUrl.match(urlPattern);

    if (match && match.length >= 3) {
      const repo = match[2].replace(/\.git$/, '');

      // A bare "github.com/owner/" leaves an empty repo name
      if (!repo) {
        return null;
      }

      return {
        owner: match[1],
        repo
      };
    }

    return null;
  } catch (error) {
    console.error(`Error parsing repo URL: ${repoUrl}`, error);
    return null;
  }
}

/**
 * Reads repos.txt and parses every entry, skipping any that are malformed
 * @returns Array of owner/repo pairs
 */
export function getParsedRepositories(): Repository[] {
  const repositories = getRepositories()
    .map(repoUrl => {
      const repository = parseRepoUrl(repoUrl);

      if (!repository) {
        console.error(`Invalid repository URL: ${repoUrl}`);
      }

      return repository;
    })
    .filter((repository): repository is Repository => repository !== null);

  if (repositories.length === 0) {
    throw new Error('No valid repositories configured in repos.txt');
  }

  return repositories;
}
