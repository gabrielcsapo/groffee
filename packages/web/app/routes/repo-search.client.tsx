"use client";

import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import {
  searchRepoCode,
  searchRepoCodeLanguages,
  searchRepoIssues,
  searchRepoPullRequests,
} from "../lib/server/search";
import { extToLang } from "../lib/highlight";
import { timeAgo } from "../lib/time";

type SearchType = "code" | "issues" | "pulls";
type SortOption = "relevance" | "newest" | "oldest";

const PAGE_SIZE = 20;

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "relevance", label: "Best match" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

interface CodeResult {
  file_path: string;
  blob_oid: string;
  snippet: string;
  highlightedSnippet?: string | null;
  lastModified?: number | null;
}

interface IssueResult {
  id: string;
  number: number;
  title: string;
  status: string;
  titleSnippet: string;
  bodySnippet: string;
  createdAt: string | null;
}

interface PRResult {
  id: string;
  number: number;
  title: string;
  status: string;
  titleSnippet: string;
  bodySnippet: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string | null;
}

interface AllResults {
  code: CodeResult[];
  issues: IssueResult[];
  pulls: PRResult[];
}

interface AllCounts {
  code: number | null;
  issues: number | null;
  pulls: number | null;
}

interface LangCount {
  ext: string;
  count: number;
}

function langDisplayName(ext: string): string {
  const lang = extToLang[ext];
  if (lang) return lang.charAt(0).toUpperCase() + lang.slice(1);
  return `.${ext}`;
}

const TABS: { key: SearchType; label: string; icon: React.ReactNode }[] = [
  {
    key: "code",
    label: "Code",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
  },
  {
    key: "issues",
    label: "Issues",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "pulls",
    label: "Pull Requests",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 8v8m0-8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100 4 2 2 0 000-4zm10-8a2 2 0 100-4 2 2 0 000 4zm0 0v4a2 2 0 01-2 2H9"
        />
      </svg>
    ),
  },
];

export function RepoSearchView({ owner, repo }: { owner: string; repo: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialType = (searchParams.get("type") as SearchType) || "code";
  const initialPage = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const initialExt = searchParams.get("ext") || null;
  const initialSort = (searchParams.get("sort") as SortOption) || "relevance";

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchType>(initialType);
  const [page, setPage] = useState(initialPage);
  const [sort, setSort] = useState<SortOption>(initialSort);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AllResults>({
    code: [],
    issues: [],
    pulls: [],
  });
  const [counts, setCounts] = useState<AllCounts>({
    code: null,
    issues: null,
    pulls: null,
  });
  const [searched, setSearched] = useState(false);
  const [langCounts, setLangCounts] = useState<LangCount[]>([]);
  const [selectedLang, setSelectedLang] = useState<string | null>(initialExt);

  function fetchLanguages(q: string) {
    searchRepoCodeLanguages(owner, repo, q)
      .then((data) => setLangCounts(data.languages || []))
      .catch(() => setLangCounts([]));
  }

  const performSearchAll = useCallback(
    async (q: string, activeType: SearchType, p: number, ext: string | null, s: SortOption = "relevance") => {
      if (!q.trim()) return;
      setLoading(true);
      setSearched(true);

      const offset = (p - 1) * PAGE_SIZE;

      fetchLanguages(q);

      try {
        const [codeRes, issueRes, prRes] = await Promise.allSettled([
          searchRepoCode(owner, repo, q, PAGE_SIZE, activeType === "code" ? offset : 0, ext, s),
          searchRepoIssues(owner, repo, q, PAGE_SIZE, activeType === "issues" ? offset : 0, s),
          searchRepoPullRequests(owner, repo, q, PAGE_SIZE, activeType === "pulls" ? offset : 0, s),
        ]);

        const codeVal = codeRes.status === "fulfilled" ? codeRes.value : null;
        const issueVal = issueRes.status === "fulfilled" ? issueRes.value : null;
        const prVal = prRes.status === "fulfilled" ? prRes.value : null;

        setResults({
          code: (codeVal?.results as CodeResult[]) || [],
          issues: (issueVal?.results as IssueResult[]) || [],
          pulls: (prVal?.results as PRResult[]) || [],
        });

        setCounts({
          code: codeVal?.total ?? 0,
          issues: issueVal?.total ?? 0,
          pulls: prVal?.total ?? 0,
        });
      } catch {
        setResults({ code: [], issues: [], pulls: [] });
        setCounts({ code: 0, issues: 0, pulls: 0 });
      } finally {
        setLoading(false);
      }
    },
    [owner, repo],
  );

  const performSearchTab = useCallback(
    async (q: string, type: SearchType, p: number, ext: string | null, s: SortOption = "relevance") => {
      if (!q.trim()) return;
      setLoading(true);

      const offset = (p - 1) * PAGE_SIZE;

      try {
        switch (type) {
          case "code": {
            const data = await searchRepoCode(owner, repo, q, PAGE_SIZE, offset, ext, s);
            setResults((prev) => ({ ...prev, code: (data.results as CodeResult[]) || [] }));
            setCounts((prev) => ({ ...prev, code: data.total ?? prev.code }));
            break;
          }
          case "issues": {
            const data = await searchRepoIssues(owner, repo, q, PAGE_SIZE, offset, s);
            setResults((prev) => ({ ...prev, issues: (data.results as IssueResult[]) || [] }));
            setCounts((prev) => ({ ...prev, issues: data.total ?? prev.issues }));
            break;
          }
          case "pulls": {
            const data = await searchRepoPullRequests(owner, repo, q, PAGE_SIZE, offset, s);
            setResults((prev) => ({ ...prev, pulls: (data.results as PRResult[]) || [] }));
            setCounts((prev) => ({ ...prev, pulls: data.total ?? prev.pulls }));
            break;
          }
        }
      } catch {
        setResults((prev) => ({ ...prev, [type]: [] }));
      } finally {
        setLoading(false);
      }
    },
    [owner, repo],
  );

  useEffect(() => {
    if (initialQuery) {
      performSearchAll(initialQuery, initialType, initialPage, initialExt, initialSort);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParams(q: string, type: SearchType, p: number, ext: string | null, s: SortOption = "relevance") {
    const params: Record<string, string> = { q, type };
    if (p > 1) params.page = String(p);
    if (ext && type === "code") params.ext = ext;
    if (s !== "relevance") params.sort = s;
    setSearchParams(params);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setPage(1);
    setSelectedLang(null);
    updateParams(trimmed, activeTab, 1, null, sort);
    performSearchAll(trimmed, activeTab, 1, null, sort);
  }

  function handleTabChange(tab: SearchType) {
    setActiveTab(tab);
    setPage(1);
    if (tab !== "code") setSelectedLang(null);
    const trimmed = query.trim();
    if (trimmed && searched) {
      updateParams(trimmed, tab, 1, tab === "code" ? selectedLang : null, sort);
      if (trimmed === (searchParams.get("q") || "")) {
        updateParams(trimmed, tab, 1, tab === "code" ? selectedLang : null, sort);
      } else {
        performSearchAll(trimmed, tab, 1, tab === "code" ? selectedLang : null, sort);
      }
    }
  }

  function handleSortChange(newSort: SortOption) {
    setSort(newSort);
    setPage(1);
    const trimmed = query.trim();
    if (trimmed && searched) {
      updateParams(trimmed, activeTab, 1, selectedLang, newSort);
      performSearchTab(trimmed, activeTab, 1, selectedLang, newSort);
    }
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    const trimmed = query.trim();
    if (trimmed) {
      updateParams(trimmed, activeTab, newPage, selectedLang, sort);
      performSearchTab(trimmed, activeTab, newPage, selectedLang, sort);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleLangFilter(ext: string | null) {
    setSelectedLang(ext);
    setPage(1);
    const trimmed = query.trim();
    if (trimmed && searched) {
      updateParams(trimmed, "code", 1, ext, sort);
      setLoading(true);
      searchRepoCode(owner, repo, trimmed, PAGE_SIZE, 0, ext, sort)
        .then((data) => {
          setResults((prev) => ({ ...prev, code: (data.results as CodeResult[]) || [] }));
          setCounts((prev) => ({ ...prev, code: data.total ?? prev.code }));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }

  const activeTotal = counts[activeTab] ?? 0;
  const totalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE));
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const rangeStart = activeTotal > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(page * PAGE_SIZE, activeTotal);

  return (
    <div className="mt-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary">
          Search in {owner}/{repo}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search code, issues, PRs in ${repo}...`}
              className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </div>
      </form>

      {!searched ? (
        <div className="border border-border rounded-lg p-12 text-center bg-surface">
          <svg
            className="w-12 h-12 mx-auto text-text-secondary mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-text-primary mb-1">
            Search in {owner}/{repo}
          </h3>
          <p className="text-xs text-text-secondary">
            Search code, issues, and pull requests in this repository.
          </p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Sidebar */}
          <nav className="w-52 shrink-0">
            <div className="border border-border rounded-lg overflow-hidden bg-surface">
              {TABS.map((tab, i) => {
                const count = counts[tab.key];
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                      i < TABS.length - 1 ? "border-b border-border" : ""
                    } ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    }`}
                  >
                    <span className={isActive ? "text-primary" : "text-text-secondary"}>
                      {tab.icon}
                    </span>
                    <span className="flex-1">{tab.label}</span>
                    {count !== null && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? "bg-primary/20 text-primary"
                            : count === 0
                              ? "bg-surface-secondary text-text-secondary"
                              : "bg-surface-secondary text-text-primary"
                        }`}
                      >
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Language filter */}
            {activeTab === "code" && langCounts.length > 0 && (
              <div className="mt-4 border border-border rounded-lg overflow-hidden bg-surface">
                <div className="px-3 py-2 bg-surface-secondary border-b border-border">
                  <h3 className="text-xs font-semibold text-text-primary">Languages</h3>
                </div>
                {selectedLang && (
                  <button
                    type="button"
                    onClick={() => handleLangFilter(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-link hover:bg-surface-secondary border-b border-border"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Clear filter
                  </button>
                )}
                {langCounts.map((lang) => {
                  const isActive = selectedLang === lang.ext;
                  return (
                    <button
                      key={lang.ext}
                      type="button"
                      onClick={() => handleLangFilter(isActive ? null : lang.ext)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                      }`}
                    >
                      <span className="flex-1 truncate">{langDisplayName(lang.ext)}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? "bg-primary/20 text-primary"
                            : "bg-surface-secondary text-text-secondary"
                        }`}
                      >
                        {lang.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Results */}
          <div className="flex-1 min-w-0">
            {/* Sort bar */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-secondary">
                {activeTotal > 0 && `${activeTotal.toLocaleString()} results`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary">Sort:</span>
                <div className="flex border border-border rounded-md overflow-hidden bg-surface">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSortChange(opt.key)}
                      className={`px-2.5 py-1 text-xs transition-colors ${
                        sort === opt.key
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <LoadingSkeleton />
            ) : activeTab === "code" ? (
              <CodeResults results={results.code} owner={owner} repo={repo} />
            ) : activeTab === "issues" ? (
              <IssueResults results={results.issues} owner={owner} repo={repo} />
            ) : (
              <PRResults results={results.pulls} owner={owner} repo={repo} />
            )}

            {/* Pagination */}
            {!loading && activeTotal > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={!hasPrevPage}
                    className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="text-center">
                    <span className="text-sm text-text-secondary">
                      Page {page} of {totalPages.toLocaleString()}
                    </span>
                    <span className="block text-xs text-text-secondary mt-0.5">
                      Showing {rangeStart.toLocaleString()}&ndash;{rangeEnd.toLocaleString()} of{" "}
                      {activeTotal.toLocaleString()} results
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!hasNextPage}
                    className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Result components ─── */

function LoadingSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`px-4 py-4 ${i < 4 ? "border-b border-border" : ""}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="skeleton w-4 h-4 rounded" />
            <div className="skeleton w-60 h-4" />
          </div>
          <div className="skeleton w-full h-3 mb-1" />
          <div className="skeleton w-3/4 h-3" />
        </div>
      ))}
    </div>
  );
}

function CodeResults({
  results,
  owner,
  repo,
}: {
  results: CodeResult[];
  owner: string;
  repo: string;
}) {
  if (results.length === 0) return <NoResults type="code results" />;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {results.map((result, i) => (
        <div
          key={`${result.blob_oid}-${result.file_path}-${i}`}
          className={`px-4 py-3 ${i < results.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-text-secondary shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            <Link
              to={`/${owner}/${repo}/blob/HEAD/${result.file_path}`}
              className="text-sm font-medium font-mono text-text-link hover:underline"
            >
              {result.file_path}
            </Link>
          </div>
          <pre
            className={`text-xs bg-surface-secondary rounded p-2 overflow-x-auto font-mono ${result.highlightedSnippet ? "shiki-line" : "text-text-secondary"}`}
            dangerouslySetInnerHTML={{ __html: result.highlightedSnippet || result.snippet }}
          />
          {result.lastModified && (
            <div className="flex justify-end mt-1.5">
              <span className="text-xs text-text-secondary">
                Last indexed {timeAgo(new Date(result.lastModified).toISOString())}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function IssueResults({
  results,
  owner,
  repo,
}: {
  results: IssueResult[];
  owner: string;
  repo: string;
}) {
  if (results.length === 0) return <NoResults type="issues" />;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {results.map((issue, i) => (
        <div
          key={issue.id}
          className={`px-4 py-3 ${i < results.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg
              className={`w-4 h-4 shrink-0 ${issue.status === "open" ? "text-green-600" : "text-purple-600"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
              {issue.status === "open" ? (
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              ) : (
                <path strokeLinecap="round" strokeWidth={2} d="M9 12l2 2 4-4" />
              )}
            </svg>
            <Link
              to={`/${owner}/${repo}/issue/${issue.number}`}
              className="text-sm font-semibold text-text-link hover:underline"
            >
              {issue.title}
            </Link>
            <span className="text-xs text-text-secondary">#{issue.number}</span>
          </div>
          <div className="ml-6 text-xs text-text-secondary mb-1">
            {issue.createdAt && <span>opened {timeAgo(issue.createdAt)}</span>}
          </div>
          {issue.bodySnippet && (
            <p
              className="text-xs text-text-secondary ml-6 line-clamp-2"
              dangerouslySetInnerHTML={{ __html: issue.bodySnippet }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PRResults({
  results,
  owner,
  repo,
}: {
  results: PRResult[];
  owner: string;
  repo: string;
}) {
  if (results.length === 0) return <NoResults type="pull requests" />;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {results.map((pr, i) => (
        <div
          key={pr.id}
          className={`px-4 py-3 ${i < results.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg
              className={`w-4 h-4 shrink-0 ${pr.status === "merged" ? "text-purple-600" : pr.status === "open" ? "text-green-600" : "text-red-600"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 8v8m0-8a2 2 0 100-4 2 2 0 000 4zm0 8a2 2 0 100 4 2 2 0 000-4zm10-8a2 2 0 100-4 2 2 0 000 4zm0 0v4a2 2 0 01-2 2H9"
              />
            </svg>
            <Link
              to={`/${owner}/${repo}/pull/${pr.number}`}
              className="text-sm font-semibold text-text-link hover:underline"
            >
              {pr.title}
            </Link>
            <span className="text-xs text-text-secondary">#{pr.number}</span>
          </div>
          <div className="ml-6 text-xs text-text-secondary mb-1">
            <span>
              {pr.sourceBranch} &rarr; {pr.targetBranch}
            </span>
            {pr.createdAt && <span className="ml-2">opened {timeAgo(pr.createdAt)}</span>}
          </div>
          {pr.bodySnippet && (
            <p
              className="text-xs text-text-secondary ml-6 line-clamp-2"
              dangerouslySetInnerHTML={{ __html: pr.bodySnippet }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function NoResults({ type }: { type: string }) {
  return (
    <div className="border border-border rounded-lg p-12 text-center bg-surface">
      <svg
        className="w-12 h-12 mx-auto text-text-secondary mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <h3 className="text-sm font-medium text-text-primary mb-1">No {type} found</h3>
      <p className="text-xs text-text-secondary">Try a different search term.</p>
    </div>
  );
}
