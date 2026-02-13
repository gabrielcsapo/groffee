"use client";

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { timeAgo } from "../lib/time";

interface Issue {
  id: string;
  number: number;
  title: string;
  status: string;
  author: string;
  createdAt: string;
}

export function IssuesList({
  owner,
  repo,
  initialIssues,
}: {
  owner: string;
  repo: string;
  initialIssues: Issue[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "open";
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "open") {
      setIssues(initialIssues);
      return;
    }
    setLoading(true);
    fetch(`/api/repos/${owner}/${repo}/issues?status=${status}`)
      .then((r) => r.json())
      .then((data) => setIssues(data.issues || []))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [owner, repo, status, initialIssues]);

  return (
    <div className="max-w-4xl mx-auto mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surface border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setSearchParams({ status: "open" })}
            className={`text-sm px-3 py-1.5 font-medium transition-colors ${status === "open" ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-secondary"}`}
          >
            Open
          </button>
          <button
            onClick={() => setSearchParams({ status: "closed" })}
            className={`text-sm px-3 py-1.5 font-medium transition-colors ${status === "closed" ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-secondary"}`}
          >
            Closed
          </button>
        </div>
        <Link to={`/${owner}/${repo}/issues/new`} className="btn-primary btn-sm">
          New issue
        </Link>
      </div>

      {loading ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`px-4 py-3 ${i < 2 ? "border-b border-border" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="skeleton w-4 h-4 rounded-full mt-0.5" />
                <div className="flex-1">
                  <div className="skeleton w-2/3 h-4 mb-1.5" />
                  <div className="skeleton w-40 h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : issues.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {issues.map((issue, i) => (
            <div
              key={issue.id}
              className={`px-4 py-3 ${i < issues.length - 1 ? "border-b border-border" : ""} hover:bg-surface-secondary transition-colors`}
            >
              <div className="flex items-start gap-3">
                <svg
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 ${issue.status === "open" ? "text-success" : "text-danger"}`}
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                  {issue.status === "open" && <circle cx="8" cy="8" r="3" />}
                  {issue.status === "closed" && (
                    <path d="M4 8l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                  )}
                </svg>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/${owner}/${repo}/issue/${issue.number}`}
                    className="text-sm font-semibold text-text-primary hover:text-text-link hover:underline"
                  >
                    {issue.title}
                  </Link>
                  <p className="text-xs text-text-secondary mt-0.5">
                    #{issue.number} opened {timeAgo(issue.createdAt)} by {issue.author}
                  </p>
                </div>
              </div>
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-sm font-medium text-text-primary mb-1">No {status} issues</h3>
          <p className="text-xs text-text-secondary">
            {status === "open" ? "There are no open issues." : "There are no closed issues."}
          </p>
        </div>
      )}
    </div>
  );
}
