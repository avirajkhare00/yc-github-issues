"use client";

import { useEffect, useState } from "react";
import { Issue } from "./services/githubService";
import IssueCard from "./components/IssueCard";
import LoadingSpinner from "./components/LoadingSpinner";

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showPRs, setShowPRs] = useState<boolean>(false);

  // Filter issues based on showPRs state
  useEffect(() => {
    if (issues.length > 0) {
      if (!showPRs) {
        // Filter out pull requests (items with pull_request property)
        setFilteredIssues(issues.filter(issue => !issue.hasOwnProperty('pull_request')));
      } else {
        // Show all issues including PRs
        setFilteredIssues(issues);
      }
    }
  }, [issues, showPRs]);

  useEffect(() => {
    // Fetch repositories on client side
    const fetchRepos = async () => {
      try {
        // We can't directly use getRepositories() on the client side
        // Instead, we'll fetch the repos from our API
        const response = await fetch('/api/issues');
        const data = await response.json();
        
        if (response.ok) {
          setIssues(data.issues);
        } else {
          setError(data.error || 'Failed to fetch issues');
        }
      } catch (err) {
        setError('An error occurred while fetching the issues');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRepos();
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="mb-10">
        <h1 className="text-3xl font-bold mb-2">YC GitHub Good First Issues</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Find beginner-friendly issues from YC-backed open source projects
        </p>
      </header>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      ) : issues.length === 0 ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
          <p className="text-yellow-700 dark:text-yellow-400">
            No issues found. Try adding more repositories to repos.txt or check back later.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-600 dark:text-gray-400">
              Found {issues.length} items across {new Set(issues.map(issue => issue.repository_name)).size} repositories
              {!showPRs && ` (${issues.length - filteredIssues.length} PRs hidden)`}
            </p>
            
            <div className="flex items-center space-x-2">
              <label htmlFor="show-prs" className="text-sm font-medium cursor-pointer">
                {showPRs ? "Hide PRs" : "Show PRs"}
              </label>
              <button
                id="show-prs"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${showPRs ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                onClick={() => setShowPRs(!showPRs)}
                role="switch"
                aria-checked={showPRs}
              >
                <span 
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showPRs ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIssues.map((issue) => (
              <IssueCard 
                key={issue.id} 
                issue={issue} 
                isPR={issue.hasOwnProperty('pull_request')}
              />
            ))}
          </div>
        </div>
      )}

      <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-500 dark:text-gray-400">
        <p>Vibe coded by <a href="https://twitter.com/avirajkhare00" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">@avirajkhare00</a></p>
      </footer>
    </div>
  );
}
