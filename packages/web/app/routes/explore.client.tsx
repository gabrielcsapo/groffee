"use client";

import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-flight-router/client";
import { timeAgo } from "../lib/time";
import { searchRepos } from "../lib/server/search";
import { RepositoryRow } from "@groffee/ui";

interface Repo {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  owner: string;
  updatedAt: string;
  createdAt: string;
}

export function ExploreList({ initialRepos }: { initialRepos: Repo[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [repos, setRepos] = useState<Repo[]>(initialQuery ? [] : initialRepos);
  const [loading, setLoading] = useState(!!initialQuery);

  const fetchRepos = useCallback(
    (q: string) => {
      if (!q) {
        setRepos(initialRepos);
        setLoading(false);
        return;
      }
      setLoading(true);
      searchRepos(q, 30)
        .then((data) => setRepos((data.repositories as Repo[]) || []))
        .catch(() => setRepos([]))
        .finally(() => setLoading(false));
    },
    [initialRepos],
  );

  useEffect(() => {
    if (initialQuery) {
      fetchRepos(initialQuery);
    }
  }, [initialQuery, fetchRepos]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      setSearchParams(new URLSearchParams({ q: trimmed }));
    } else {
      setSearchParams(new URLSearchParams());
    }
    fetchRepos(trimmed);
  }

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="mb-6">
        <h1 className="font-editorial font-bold text-4xl text-text-primary lowercase tracking-tight mb-1">
          explore
        </h1>
        <p className="font-mono text-xs text-text-secondary">
          public repositories on this instance.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
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
              placeholder="Search repositories..."
              className="w-full pl-10 pr-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </div>
      </form>

      {loading ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`px-4 py-4 ${i < 4 ? "border-b border-border" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="skeleton w-4 h-4 rounded" />
                <div className="skeleton w-44 h-4" />
                <div className="skeleton w-12 h-4 rounded-full" />
              </div>
              <div className="skeleton w-64 h-3 ml-6 mb-2" />
              <div className="skeleton w-20 h-3 ml-6" />
            </div>
          ))}
        </div>
      ) : repos.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {repos.map((repo, i) => (
            <div
              key={repo.id}
              className={`${i < repos.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
            >
              <RepositoryRow
                owner={repo.owner}
                name={repo.name}
                description={repo.description}
                isPublic={repo.isPublic}
                updatedAt={repo.updatedAt}
                linkAs={({ to, className, children }) => (
                  <Link to={to} className={className}>
                    {children}
                  </Link>
                )}
                timeAgo={timeAgo}
              />
            </div>
          ))}
        </div>
      ) : (
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
          {initialQuery ? (
            <>
              <h3 className="text-sm font-medium text-text-primary mb-1">No repositories found</h3>
              <p className="text-xs text-text-secondary">
                No public repositories match "{initialQuery}". Try a different search term.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-text-primary mb-1">
                No public repositories yet
              </h3>
              <p className="text-xs text-text-secondary">
                When users create public repositories, they'll appear here.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
