import fs from 'fs';
import path from 'path';

/**
 * Reads the repositories from the repos.txt file
 * @returns Array of repository URLs
 */
export function getRepositories(): string[] {
  try {
    const reposFilePath = path.join(process.cwd(), 'repos.txt');
    const content = fs.readFileSync(reposFilePath, 'utf8');
    
    // Split by newlines and filter out empty lines
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (error) {
    console.error('Error reading repos.txt file:', error);
    return [];
  }
}

/**
 * Extracts owner and repo name from a GitHub repository URL
 * @param repoUrl GitHub repository URL
 * @returns Object containing owner and repo name
 */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    // Handle URLs like https://github.com/owner/repo
    const urlPattern = /github\.com\/([^\/]+)\/([^\/]+)/;
    const match = repoUrl.match(urlPattern);
    
    if (match && match.length >= 3) {
      return {
        owner: match[1],
        repo: match[2]
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error parsing repo URL: ${repoUrl}`, error);
    return null;
  }
}
