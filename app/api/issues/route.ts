import { NextResponse } from 'next/server';
import { getRepositories, parseRepoUrl } from '@/app/utils/repoUtils';
import { fetchGoodFirstIssues, fetchActiveIssues, Issue } from '@/app/services/githubService';

export async function GET() {
  try {
    const repositories = getRepositories();
    const allIssues: Issue[] = [];
    
    // Process each repository
    for (const repoUrl of repositories) {
      const repoInfo = parseRepoUrl(repoUrl);
      
      if (!repoInfo) {
        console.error(`Invalid repository URL: ${repoUrl}`);
        continue;
      }
      
      const { owner, repo } = repoInfo;
      
      // First try to get good first issues
      let issues = await fetchGoodFirstIssues(owner, repo);
      
      // If no good first issues found, get active issues instead
      if (issues.length === 0) {
        issues = await fetchActiveIssues(owner, repo);
      }
      
      allIssues.push(...issues);
    }
    
    return NextResponse.json({ issues: allIssues });
  } catch (error) {
    console.error('Error fetching issues:', error);
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}
