"use client";

import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import { getRepoCommits } from "../lib/server/repos";

interface Commit {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
}

interface Author {
  name: string;
  email: string;
  commits: number;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function CommitsList({
  owner,
  repo,
  currentRef,
  branches,
  authors,
  initialCommits,
  initialAuthorFilter = "",
}: {
  owner: string;
  repo: string;
  currentRef: string;
  branches: string[];
  authors: Author[];
  initialCommits: Commit[];
  initialAuthorFilter?: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const authorFilter = searchParams.get("author") || "";
  const [commits, setCommits] = useState<Commit[]>(initialCommits);
  const [loading, setLoading] = useState(false);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const [authorSearch, setAuthorSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!authorDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAuthorDropdownOpen(false);
        setAuthorSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [authorDropdownOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (authorDropdownOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [authorDropdownOpen]);

  const filteredAuthors = authors.filter(
    (a) =>
      !authorSearch ||
      a.name.toLowerCase().includes(authorSearch.toLowerCase()) ||
      a.email.toLowerCase().includes(authorSearch.toLowerCase()),
  );

  useEffect(() => {
    // If the filter matches what was already fetched on the server, use initialCommits
    if (authorFilter === initialAuthorFilter) {
      setCommits(initialCommits);
      return;
    }
    if (!authorFilter) {
      // Filter was cleared but server data was filtered — re-fetch unfiltered
      setLoading(true);
      getRepoCommits(owner, repo, currentRef)
        .then((data) => {
          if (data.commits) setCommits(data.commits);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    getRepoCommits(owner, repo, currentRef, { authorEmail: authorFilter })
      .then((data) => {
        if (data.commits) setCommits(data.commits);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo, currentRef, authorFilter, initialCommits, initialAuthorFilter]);

  const selectedAuthor = authors.find((a) => a.email === authorFilter);

  return (
    <div className="max-w-6xl mx-auto mt-6">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Branch selector */}
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          <select
            value={currentRef}
            onChange={(e) => {
              const newRef = e.target.value;
              const params = authorFilter ? `?author=${encodeURIComponent(authorFilter)}` : "";
              navigate(`/${owner}/${repo}/commits/${newRef}${params}`);
            }}
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-text-primary font-medium"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Author filter */}
        {authors.length > 0 && (
          <div className="relative flex items-center" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setAuthorDropdownOpen(!authorDropdownOpen);
                setAuthorSearch("");
              }}
              className={`flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 ${
                selectedAuthor
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-surface text-text-secondary"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {selectedAuthor ? selectedAuthor.name : "All authors"}
              <svg
                className={`w-3 h-3 transition-transform ${authorDropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {selectedAuthor && (
              <button
                type="button"
                onClick={() => {
                  setSearchParams({});
                  setAuthorDropdownOpen(false);
                }}
                className="ml-1 text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface-secondary"
                title="Clear author filter"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {authorDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-72 bg-surface border border-border rounded-lg shadow-xl z-30 animate-fade-in">
                <div className="p-2 border-b border-border">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={authorSearch}
                    onChange={(e) => setAuthorSearch(e.target.value)}
                    placeholder="Filter authors..."
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface-secondary text-text-primary placeholder:text-text-secondary/50"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {!authorSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchParams({});
                        setAuthorDropdownOpen(false);
                        setAuthorSearch("");
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary flex items-center justify-between ${
                        !authorFilter ? "text-primary font-medium" : "text-text-primary"
                      }`}
                    >
                      <span>All authors</span>
                      {!authorFilter && (
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}
                  {filteredAuthors.length > 0 ? (
                    filteredAuthors.map((a) => (
                      <button
                        key={a.email}
                        type="button"
                        onClick={() => {
                          setSearchParams({ author: a.email });
                          setAuthorDropdownOpen(false);
                          setAuthorSearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary flex items-center justify-between gap-2 ${
                          authorFilter === a.email ? "text-primary font-medium" : "text-text-primary"
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-surface-secondary flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
                            {a.name[0]?.toUpperCase()}
                          </span>
                          <span className="truncate">{a.name}</span>
                          <span className="text-text-secondary text-xs flex-shrink-0">
                            {a.commits}
                          </span>
                        </span>
                        {authorFilter === a.email && (
                          <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-text-secondary">No authors match</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <span className="text-xs text-text-secondary animate-pulse-subtle">
            Loading...
          </span>
        )}
      </div>

      {/* Commit count */}
      <div className="flex items-center gap-2 mb-4 text-sm text-text-secondary">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {commits.length} commit{commits.length !== 1 ? "s" : ""} on{" "}
          <strong className="text-text-primary">{currentRef}</strong>
          {selectedAuthor && (
            <>
              {" "}
              by <strong className="text-text-primary">{selectedAuthor.name}</strong>
            </>
          )}
        </span>
      </div>

      {/* Commit list */}
      {loading ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`px-4 py-3 ${i < 4 ? "border-b border-border" : ""}`}
            >
              <div className="skeleton w-3/4 h-4 mb-1.5" />
              <div className="skeleton w-48 h-3" />
            </div>
          ))}
        </div>
      ) : commits.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          {commits.map((commit, i) => (
            <div
              key={commit.oid}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${i < commits.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary`}
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/${owner}/${repo}/commit/${commit.oid}`}
                  className="text-sm font-medium text-text-primary hover:text-text-link hover:underline"
                >
                  {commit.message.split("\n")[0]}
                </Link>
                <p className="text-xs text-text-secondary mt-0.5">
                  <Link
                    to={`/${owner}/${repo}/commits/${currentRef}?author=${encodeURIComponent(commit.author.email)}`}
                    className="hover:text-text-link hover:underline"
                  >
                    {commit.author.name}
                  </Link>{" "}
                  committed {timeAgo(commit.author.timestamp)}
                </p>
              </div>
              <Link
                to={`/${owner}/${repo}/commit/${commit.oid}`}
                className="text-xs font-mono text-text-link bg-surface-secondary border border-border rounded px-2 py-1 hover:bg-primary hover:text-white hover:no-underline"
              >
                {commit.oid.slice(0, 7)}
              </Link>
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-text-primary mb-1">
            No commits found
          </h3>
          {selectedAuthor && (
            <p className="text-xs text-text-secondary">
              No commits by {selectedAuthor.name} on this branch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
