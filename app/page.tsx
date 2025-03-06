"use client";

import { useEffect, useState } from "react";
import { Issue } from "./services/githubService";
import IssueCard from "./components/IssueCard";
import LoadingSpinner from "./components/LoadingSpinner";

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            Found {issues.length} issues across {new Set(issues.map(issue => issue.repository_name)).size} repositories
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      )}

      <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-500 dark:text-gray-400">
        <p>Built with Next.js 15</p>
      </footer>
    </div>
  );
}
