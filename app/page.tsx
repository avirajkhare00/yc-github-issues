"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Issue } from "./services/githubService";
import { CompanyMeta } from "./utils/repoUtils";
import IssueCard from "./components/IssueCard";
import LoadingSpinner from "./components/LoadingSpinner";
import ThemeToggle from "./components/ThemeToggle";

type SortKey = "updated" | "least-discussed" | "repo";
type AgeKey = "6mo" | "30d" | "any";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Recently updated",
  "least-discussed": "Least discussed",
  repo: "Repository"
};

// A "good first issue" nobody has touched in a year is usually already fixed
// or abandoned, so the default hides them rather than wasting people's time.
const AGE_LABELS: Record<AgeKey, string> = {
  "6mo": "Active in 6 months",
  "30d": "Active in 30 days",
  any: "Any age"
};

const AGE_LIMIT_DAYS: Record<AgeKey, number> = {
  "6mo": 180,
  "30d": 30,
  any: Infinity
};

export default function Home() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Set when the API could only reach some of the configured repositories
  const [degraded, setDegraded] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  // Wall clock captured when the data arrived. Filtering by age needs a fixed
  // reference point: reading the clock inside the memo would make it impure.
  const [loadedAt, setLoadedAt] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [companies, setCompanies] = useState<Record<string, CompanyMeta>>({});

  const [query, setQuery] = useState<string>("");
  const [language, setLanguage] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [age, setAge] = useState<AgeKey>("6mo");
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(true);
  const [hiringOnly, setHiringOnly] = useState<boolean>(false);
  const [showPRs, setShowPRs] = useState<boolean>(false);

  const languages = useMemo(() => {
    const present = new Set(
      issues.map(issue => issue.language).filter((value): value is string => Boolean(value))
    );

    return [...present].sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const visibleIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const maxAgeDays = AGE_LIMIT_DAYS[age];

    const filtered = issues.filter(issue => {
      // GitHub's issues endpoint also returns PRs; hide them unless asked for
      if (!showPRs && issue.is_pull_request) return false;
      if (unassignedOnly && issue.is_assigned) return false;
      if (language !== "all" && issue.language !== language) return false;

      const ageDays = (loadedAt - new Date(issue.updated_at).getTime()) / 86_400_000;

      if (ageDays > maxAgeDays) return false;

      if (hiringOnly && !companies[issue.repository_name]?.is_hiring) return false;

      if (
        needle &&
        !issue.title.toLowerCase().includes(needle) &&
        !issue.repository_name.toLowerCase().includes(needle)
      ) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "least-discussed") return a.comments - b.comments;
      if (sort === "repo") return a.repository_name.localeCompare(b.repository_name);

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [issues, query, language, sort, age, unassignedOnly, hiringOnly, showPRs, companies, loadedAt]);

  const repoCount = useMemo(
    () => new Set(visibleIssues.map(issue => issue.repository_name)).size,
    [visibleIssues]
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
        setCompanies(data.companies ?? {});
        setLoadedAt(Date.now());
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

  // Resets to the defaults, not to "no filters at all": unassigned and
  // 6-month-active are what make the list trustworthy, so clearing should not
  // dump a pile of taken and abandoned issues back in.
  const resetFilters = () => {
    setQuery("");
    setLanguage("all");
    setAge("6mo");
    setUnassignedOnly(true);
    setHiringOnly(false);
    setShowPRs(false);
  };

  const filtersActive =
    query.trim() !== "" ||
    language !== "all" ||
    age !== "6mo" ||
    !unassignedOnly ||
    hiringOnly ||
    showPRs;

  const controlClass =
    "rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">YC Good First Issues</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Beginner-friendly issues from YC-backed open source projects
            </p>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {!loading && !error && issues.length > 0 && (
        <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-white/85 dark:bg-gray-950/85 backdrop-blur">
          <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search title or repository…"
              aria-label="Search issues"
              className={`${controlClass} flex-1 min-w-[14rem]`}
            />

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Language</span>
              <select
                value={language}
                onChange={event => setLanguage(event.target.value)}
                className={controlClass}
              >
                <option value="all">All</option>
                {languages.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Sort</span>
              <select
                value={sort}
                onChange={event => setSort(event.target.value as SortKey)}
                className={controlClass}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Activity</span>
              <select
                value={age}
                onChange={event => setAge(event.target.value as AgeKey)}
                className={controlClass}
              >
                {Object.entries(AGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={unassignedOnly}
                onChange={event => setUnassignedOnly(event.target.checked)}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Unassigned only
            </label>

            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              title="Only companies currently hiring — contributing is a warm intro"
            >
              <input
                type="checkbox"
                checked={hiringOnly}
                onChange={event => setHiringOnly(event.target.checked)}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Hiring only
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showPRs}
                onChange={event => setShowPRs(event.target.checked)}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show PRs
            </label>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
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
          <>
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

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Showing <strong>{visibleIssues.length}</strong> of {issues.length} items
                across {repoCount} repositories
                {fetchedAt && ` · updated ${new Date(fetchedAt).toLocaleTimeString()}`}
              </p>

              <div className="flex items-center gap-2">
                {filtersActive && (
                  <button
                    onClick={resetFilters}
                    className="text-sm px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Clear filters
                  </button>
                )}
                <button
                  onClick={() => loadIssues(true)}
                  disabled={refreshing}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {visibleIssues.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  No issues match these filters.
                </p>
                <button
                  onClick={resetFilters}
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleIssues.map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    isPR={issue.is_pull_request}
                    company={companies[issue.repository_name]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 mt-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>
          Vibe coded by{" "}
          <a
            href="https://twitter.com/avirajkhare00"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            @avirajkhare00
          </a>
        </p>
      </footer>
    </div>
  );
}
