import { Octokit } from 'octokit';

// Get GitHub token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Initialize Octokit with auth token if available
const octokit = new Octokit(GITHUB_TOKEN ? {
  auth: GITHUB_TOKEN
} : {});

// Log whether we're using authenticated requests
console.log(`GitHub API: ${GITHUB_TOKEN ? 'Using authenticated requests (5,000 req/hr)' : 'Using unauthenticated requests (60 req/hr)'}`);


export interface Issue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  created_at: string;
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
  repository_url: string;
  repository_name?: string;
}

/**
 * Fetches good first issues from a GitHub repository
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Array of issues
 */
export async function fetchGoodFirstIssues(owner: string, repo: string): Promise<Issue[]> {
  try {
    // Fetch issues with the "good first issue" label
    const response = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'good first issue',
      per_page: 10, // Limit to 10 issues per repo to avoid rate limits
      sort: 'updated',
      direction: 'desc'
    });

    // Add repository name to each issue
    return response.data.map(issue => ({
      ...issue,
      repository_name: `${owner}/${repo}`
    })) as Issue[];
  } catch (error) {
    console.error(`Error fetching good first issues for ${owner}/${repo}:`, error);
    return [];
  }
}

/**
 * Fetches active issues from a GitHub repository if no good first issues are found
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Array of issues
 */
export async function fetchActiveIssues(owner: string, repo: string): Promise<Issue[]> {
  try {
    // Fetch recent open issues
    const response = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 5, // Limit to 5 issues per repo
      sort: 'updated',
      direction: 'desc'
    });

    // Add repository name to each issue
    return response.data.map(issue => ({
      ...issue,
      repository_name: `${owner}/${repo}`
    })) as Issue[];
  } catch (error) {
    console.error(`Error fetching active issues for ${owner}/${repo}:`, error);
    return [];
  }
}
