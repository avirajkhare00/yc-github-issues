"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Issue } from "./services/githubService";
import IssueCard from "./components/IssueCard";
import LoadingSpinner from "./components/LoadingSpinner";

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showPRs, setShowPRs] = useState<boolean>(false);
  // Set when the API could only reach some of the configured repositories
  const [degraded, setDegraded] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // GitHub's issues endpoint also returns PRs; hide them unless asked for
  const filteredIssues = useMemo(
    () => (showPRs ? issues : issues.filter(issue => !issue.is_pull_request)),
    [issues, showPRs]
  );

  const repoCount = useMemo(
    () => new Set(filteredIssues.map(issue => issue.repository_name)).size,
    [filteredIssues]
  );

  const loadIssues = useCallback(async (forceRefresh: boolean) => {
    if (forceRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(
        forceRefresh ? '/api/issues?refresh=1' : '/api/issues',
        forceRefresh ? { cache: 'no-store' } : undefined
      );
      const data = await response.json();

      if (response.ok) {
        setIssues(data.issues);
        setDegraded(Boolean(data.degraded));
        setFetchedAt(data.fetchedAt ?? null);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch issues');
      }
    } catch (err) {
      setError('An error occurred while fetching the issues');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount. The rule guards against synchronous setState in an
    // effect; here every setState happens after an await, once the request
    // resolves. Better long term: load the first page server-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadIssues(false);
  }, [loadIssues]);

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
          {degraded && (
            <div
              role="status"
              className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg mb-6"
            >
              <p className="text-amber-700 dark:text-amber-400">
                Some repositories couldn&apos;t be reached, so this list is incomplete.
                It refreshes automatically within a minute.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-600 dark:text-gray-400">
              Showing {filteredIssues.length} items across {repoCount} repositories
              {!showPRs && ` (${issues.length - filteredIssues.length} PRs hidden)`}
              {fetchedAt && (
                <span className="block text-sm">
                  Updated {new Date(fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </p>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => loadIssues(true)}
                disabled={refreshing}
                className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>

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
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                isPR={issue.is_pull_request}
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
