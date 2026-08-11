export type SortKey = "updated" | "least-discussed" | "repo";
export type AgeKey = "6mo" | "30d" | "any";

export interface Filters {
  query: string;
  language: string;
  sort: SortKey;
  age: AgeKey;
  unassignedOnly: boolean;
  hiringOnly: boolean;
  showPRs: boolean;
}

// The defaults are what make the list trustworthy: unassigned work at
// actively-maintained repos. They are omitted from the URL so a shared link
// stays short and readable.
export const DEFAULT_FILTERS: Filters = {
  query: "",
  language: "all",
  sort: "updated",
  age: "6mo",
  unassignedOnly: true,
  hiringOnly: false,
  showPRs: false
};

const SORT_VALUES: SortKey[] = ["updated", "least-discussed", "repo"];
const AGE_VALUES: AgeKey[] = ["6mo", "30d", "any"];

/**
 * Reads filters out of a query string, falling back to defaults for anything
 * missing or unrecognised.
 * @param search A location.search value
 * @returns Complete filter state
 */
export function filtersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as SortKey | null;
  const age = params.get("age") as AgeKey | null;

  return {
    query: params.get("q") ?? DEFAULT_FILTERS.query,
    language: params.get("lang") ?? DEFAULT_FILTERS.language,
    sort: sort && SORT_VALUES.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    age: age && AGE_VALUES.includes(age) ? age : DEFAULT_FILTERS.age,
    // Defaults are on, so their absence means on; "0" turns them off
    unassignedOnly: params.get("unassigned") !== "0",
    hiringOnly: params.get("hiring") === "1",
    showPRs: params.get("prs") === "1"
  };
}

/**
 * Serialises filters to a query string, omitting anything left at its default.
 * @param filters Current filter state
 * @returns Query string including "?", or "" when everything is default
 */
export function searchFromFilters(filters: Filters): string {
  const params = new URLSearchParams();

  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.language !== DEFAULT_FILTERS.language) params.set("lang", filters.language);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.age !== DEFAULT_FILTERS.age) params.set("age", filters.age);
  if (!filters.unassignedOnly) params.set("unassigned", "0");
  if (filters.hiringOnly) params.set("hiring", "1");
  if (filters.showPRs) params.set("prs", "1");

  const search = params.toString();

  return search ? `?${search}` : "";
}
