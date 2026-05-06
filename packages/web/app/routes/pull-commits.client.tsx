"use client";

import { Link } from "react-flight-router/client";
import { timeAgo } from "../lib/time";

export interface PRCommit {
  oid: string;
  message: string;
  author: string;
  authorEmail: string;
  authorTimestamp: number;
}

function shortOid(oid: string) {
  return oid.slice(0, 7);
}

function firstLine(message: string) {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}

export function PullCommitsView({
  owner,
  repo,
  commits,
}: {
  owner: string;
  repo: string;
  commits: PRCommit[];
}) {
  if (!commits.length) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
        No commits found between branches.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary">
        {commits.length} commit{commits.length === 1 ? "" : "s"}
      </div>
      <ul className="divide-y divide-border">
        {commits.map((c) => (
          <li
            key={c.oid}
            className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-secondary/40"
          >
            <div className="min-w-0 flex-1">
              <Link
                to={`/${owner}/${repo}/commit/${c.oid}`}
                className="text-sm text-text-primary font-medium hover:underline truncate block"
              >
                {firstLine(c.message)}
              </Link>
              <div className="text-xs text-text-secondary mt-0.5">
                <span className="font-medium text-text-primary">{c.author}</span> committed{" "}
                {c.authorTimestamp ? timeAgo(new Date(c.authorTimestamp * 1000).toISOString()) : ""}
              </div>
            </div>
            <Link
              to={`/${owner}/${repo}/commit/${c.oid}`}
              className="text-xs font-mono text-text-secondary hover:text-text-primary border border-border rounded px-2 py-1 shrink-0"
              title={c.oid}
            >
              {shortOid(c.oid)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
