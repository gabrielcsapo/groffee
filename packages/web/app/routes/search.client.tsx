"use client";

import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import {
  searchIssues,
  searchPullRequests,
  searchCode,
  searchCodeLanguages,
  searchRepos,
} from "../lib/server/search";
import { extToLang } from "../lib/highlight";
import { timeAgo } from "../lib/time";

type SearchType = "code" | "repositories" | "issues" | "pulls";

const PAGE_SIZE = 20;

interface CodeResult {
  file_path: string;
  blob_oid: string;
  snippet: string;
  repo_id?: string;
  repo_name?: string;
  repo_owner?: string;
}

interface RepoResult {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  owner: string;
  updatedAt: string;
}

interface IssueResult {
  id: string;
  number: number;
  title: string;
  status: string;
  titleSnippet: string;
  bodySnippet: string;
  repoName: string;
  repoOwner: string;
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
  repoName: string;
  repoOwner: string;
  createdAt: string | null;
}

interface AllResults {
  code: CodeResult[];
  repositories: RepoResult[];
  issues: IssueResult[];
  pulls: PRResult[];
}

interface AllCounts {
  code: number | null;
  repositories: number | null;
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
    key: "repositories",
    label: "Repositories",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
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

export function SearchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialType = (searchParams.get("type") as SearchType) || "code";
  const initialPage = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
  const initialExt = searchParams.get("ext") || null;

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchType>(initialType);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AllResults>({
    code: [],
    repositories: [],
    issues: [],
    pulls: [],
  });
  const [counts, setCounts] = useState<AllCounts>({
    code: null,
    repositories: null,
    issues: null,
    pulls: null,
  });
  const [searched, setSearched] = useState(false);
  const [langCounts, setLangCounts] = useState<LangCount[]>([]);
  const [selectedLang, setSelectedLang] = useState<string | null>(initialExt);
  const [helpOpen, setHelpOpen] = useState(false);

  // Fetch language facets (non-blocking, fire-and-forget)
  function fetchLanguages(q: string) {
    searchCodeLanguages(q)
      .then((data) => setLangCounts(data.languages || []))
      .catch(() => setLangCounts([]));
  }

  // Search all types in parallel
  const performSearchAll = useCallback(
    async (q: string, activeType: SearchType, p: number, ext: string | null) => {
      if (!q.trim()) return;
      setLoading(true);
      setSearched(true);

      const offset = (p - 1) * PAGE_SIZE;

      // Fetch language facets alongside
      fetchLanguages(q);

      try {
        const [codeRes, repoRes, issueRes, prRes] = await Promise.allSettled([
          searchCode(q, PAGE_SIZE, activeType === "code" ? offset : 0, ext),
          searchRepos(q, PAGE_SIZE, activeType === "repositories" ? offset : 0),
          searchIssues(q, PAGE_SIZE, activeType === "issues" ? offset : 0),
          searchPullRequests(q, PAGE_SIZE, activeType === "pulls" ? offset : 0),
        ]);

        const codeVal = codeRes.status === "fulfilled" ? codeRes.value : null;
        const repoVal = repoRes.status === "fulfilled" ? repoRes.value : null;
        const issueVal = issueRes.status === "fulfilled" ? issueRes.value : null;
        const prVal = prRes.status === "fulfilled" ? prRes.value : null;

        setResults({
          code: (codeVal?.results as CodeResult[]) || [],
          repositories: (repoVal?.repositories as RepoResult[]) || [],
          issues: (issueVal?.results as IssueResult[]) || [],
          pulls: (prVal?.results as PRResult[]) || [],
        });

        setCounts({
          code: codeVal?.total ?? 0,
          repositories: repoVal?.total ?? 0,
          issues: issueVal?.total ?? 0,
          pulls: prVal?.total ?? 0,
        });
      } catch {
        setResults({ code: [], repositories: [], issues: [], pulls: [] });
        setCounts({ code: 0, repositories: 0, issues: 0, pulls: 0 });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Load a single tab's page
  const performSearchTab = useCallback(
    async (q: string, type: SearchType, p: number, ext: string | null) => {
      if (!q.trim()) return;
      setLoading(true);

      const offset = (p - 1) * PAGE_SIZE;

      try {
        switch (type) {
          case "code": {
            const data = await searchCode(q, PAGE_SIZE, offset, ext);
            setResults((prev) => ({ ...prev, code: (data.results as CodeResult[]) || [] }));
            setCounts((prev) => ({ ...prev, code: data.total ?? prev.code }));
            break;
          }
          case "repositories": {
            const data = await searchRepos(q, PAGE_SIZE, offset);
            setResults((prev) => ({
              ...prev,
              repositories: (data.repositories as RepoResult[]) || [],
            }));
            setCounts((prev) => ({ ...prev, repositories: data.total ?? prev.repositories }));
            break;
          }
          case "issues": {
            const data = await searchIssues(q, PAGE_SIZE, offset);
            setResults((prev) => ({
              ...prev,
              issues: (data.results as IssueResult[]) || [],
            }));
            setCounts((prev) => ({ ...prev, issues: data.total ?? prev.issues }));
            break;
          }
          case "pulls": {
            const data = await searchPullRequests(q, PAGE_SIZE, offset);
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
    [],
  );

  useEffect(() => {
    if (initialQuery) {
      performSearchAll(initialQuery, initialType, initialPage, initialExt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateParams(q: string, type: SearchType, p: number, ext: string | null) {
    const params: Record<string, string> = { q, type };
    if (p > 1) params.page = String(p);
    if (ext && type === "code") params.ext = ext;
    setSearchParams(params);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setPage(1);
    setSelectedLang(null);
    updateParams(trimmed, activeTab, 1, null);
    performSearchAll(trimmed, activeTab, 1, null);
  }

  function handleTabChange(tab: SearchType) {
    setActiveTab(tab);
    setPage(1);
    if (tab !== "code") setSelectedLang(null);
    const trimmed = query.trim();
    if (trimmed && searched) {
      updateParams(trimmed, tab, 1, tab === "code" ? selectedLang : null);
      if (trimmed === (searchParams.get("q") || "")) {
        updateParams(trimmed, tab, 1, tab === "code" ? selectedLang : null);
      } else {
        performSearchAll(trimmed, tab, 1, tab === "code" ? selectedLang : null);
      }
    }
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    const trimmed = query.trim();
    if (trimmed) {
      updateParams(trimmed, activeTab, newPage, selectedLang);
      performSearchTab(trimmed, activeTab, newPage, selectedLang);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleLangFilter(ext: string | null) {
    setSelectedLang(ext);
    setPage(1);
    const trimmed = query.trim();
    if (trimmed && searched) {
      updateParams(trimmed, "code", 1, ext);
      setLoading(true);
      searchCode(trimmed, PAGE_SIZE, 0, ext)
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
    <div className="max-w-5xl mx-auto mt-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Search</h1>
        <p className="text-sm text-text-secondary">
          Search code, repositories, issues, and pull requests across Groffee.
        </p>
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
              placeholder="Search..."
              className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Search
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="px-2.5 py-2 border border-border rounded-md bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-secondary transition-colors"
            title="Search syntax help"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </form>

      {!searched ? (
        <EmptyPrompt />
      ) : (
        <div className="flex gap-6">
          {/* Sidebar with type counts */}
          <nav className="w-56 shrink-0">
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

            {/* Language filter (Code tab only) */}
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
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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

          {/* Main results area */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <LoadingSkeleton />
            ) : activeTab === "code" ? (
              <CodeResults results={results.code} />
            ) : activeTab === "repositories" ? (
              <RepoResults results={results.repositories} />
            ) : activeTab === "issues" ? (
              <IssueResults results={results.issues} />
            ) : (
              <PRResults results={results.pulls} />
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

      {helpOpen && <SearchHelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/* ─── Helper components ─── */

function SearchHelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-surface border border-border rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Search Syntax</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-5 py-4 space-y-3 text-sm">
            <p className="text-text-secondary text-xs">
              Groffee uses SQLite FTS5 for full-text search. The following syntax is supported
              across code, issues, and pull request searches.
            </p>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Syntax</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 font-medium">Example</th>
                </tr>
              </thead>
              <tbody className="text-text-primary">
                <HelpRow
                  syntax={'"exact phrase"'}
                  description="Match an exact sequence of words"
                  example={'"hello world"'}
                />
                <HelpRow
                  syntax="word1 word2"
                  description="Implicit AND &mdash; both must appear"
                  example="react router"
                />
                <HelpRow
                  syntax="word1 OR word2"
                  description="Match either word"
                  example="useState OR useReducer"
                />
                <HelpRow
                  syntax="NOT word"
                  description="Exclude documents containing word"
                  example="router NOT express"
                />
                <HelpRow
                  syntax="prefix*"
                  description="Match words starting with a prefix"
                  example="func*"
                />
                <HelpRow
                  syntax="(a OR b) AND c"
                  description="Group expressions with parentheses"
                  example='(error OR warn) AND "log"'
                />
              </tbody>
            </table>

            <div className="border-t border-border pt-3">
              <h3 className="text-xs font-semibold text-text-primary mb-1">Language Filtering</h3>
              <p className="text-text-secondary text-xs">
                When viewing code results, use the Languages sidebar to filter by programming
                language. Click a language to narrow results to files with that extension.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs text-text-secondary">
                Search uses Porter stemming &mdash; words are stemmed automatically (e.g.,
                &quot;running&quot; matches &quot;run&quot;). See the{" "}
                <a href="/docs#search" className="text-text-link hover:underline">
                  API documentation
                </a>{" "}
                for more details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HelpRow({
  syntax,
  description,
  example,
}: {
  syntax: string;
  description: string;
  example: string;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 font-mono whitespace-nowrap">{syntax}</td>
      <td className="py-2 pr-4 text-text-secondary" dangerouslySetInnerHTML={{ __html: description }} />
      <td className="py-2 font-mono text-text-secondary">{example}</td>
    </tr>
  );
}

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

function EmptyPrompt() {
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
      <h3 className="text-sm font-medium text-text-primary mb-1">Search across Groffee</h3>
      <p className="text-xs text-text-secondary">
        Enter a search term to find code, repositories, issues, and pull requests.
      </p>
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

function CodeResults({ results }: { results: CodeResult[] }) {
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
            {result.repo_owner && result.repo_name ? (
              <Link
                to={`/${result.repo_owner}/${result.repo_name}`}
                className="text-xs text-text-secondary hover:text-text-link"
              >
                {result.repo_owner}/{result.repo_name}
              </Link>
            ) : null}
            <span className="text-sm font-medium font-mono text-text-link">
              {result.file_path}
            </span>
          </div>
          <pre
            className="text-xs text-text-secondary bg-surface-secondary rounded p-2 overflow-x-auto font-mono"
            dangerouslySetInnerHTML={{ __html: result.snippet }}
          />
        </div>
      ))}
    </div>
  );
}

function RepoResults({ results }: { results: RepoResult[] }) {
  if (results.length === 0) return <NoResults type="repositories" />;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {results.map((repo, i) => (
        <div
          key={repo.id}
          className={`px-4 py-4 ${i < results.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <Link
              to={`/${repo.owner}/${repo.name}`}
              className="text-base font-semibold text-text-link hover:underline"
            >
              {repo.owner}
              <span className="text-text-secondary font-normal">/</span>
              {repo.name}
            </Link>
            {repo.isPublic && <span className="badge badge-public">Public</span>}
          </div>
          {repo.description && (
            <p className="text-sm text-text-secondary mb-2 ml-6">{repo.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-text-secondary ml-6">
            <span>Updated {timeAgo(repo.updatedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueResults({ results }: { results: IssueResult[] }) {
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
              to={`/${issue.repoOwner}/${issue.repoName}/issue/${issue.number}`}
              className="text-sm font-semibold text-text-link hover:underline"
            >
              {issue.title}
            </Link>
            <span className="text-xs text-text-secondary">#{issue.number}</span>
          </div>
          <div className="ml-6 text-xs text-text-secondary mb-1">
            <Link
              to={`/${issue.repoOwner}/${issue.repoName}`}
              className="hover:text-text-link"
            >
              {issue.repoOwner}/{issue.repoName}
            </Link>
            {issue.createdAt && <span className="ml-2">opened {timeAgo(issue.createdAt)}</span>}
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

function PRResults({ results }: { results: PRResult[] }) {
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
              to={`/${pr.repoOwner}/${pr.repoName}/pull/${pr.number}`}
              className="text-sm font-semibold text-text-link hover:underline"
            >
              {pr.title}
            </Link>
            <span className="text-xs text-text-secondary">#{pr.number}</span>
          </div>
          <div className="ml-6 text-xs text-text-secondary mb-1">
            <Link
              to={`/${pr.repoOwner}/${pr.repoName}`}
              className="hover:text-text-link"
            >
              {pr.repoOwner}/{pr.repoName}
            </Link>
            <span className="ml-2">
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
