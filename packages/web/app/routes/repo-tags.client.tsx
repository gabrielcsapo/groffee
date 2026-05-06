"use client";

import { useState } from "react";
import { Link } from "react-flight-router/client";
import { getRepoTags } from "../lib/server/repos";
import { LoadMore } from "../components/load-more.client";

interface Tag {
  name: string;
  commitOid: string;
  shortOid: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authorTimestamp: number;
}

function formatRelativeDate(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

export function RepoTagsLoadMore({
  owner,
  repo,
  initialCursor,
}: {
  owner: string;
  repo: string;
  initialCursor: string;
}) {
  const [more, setMore] = useState<Tag[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);

  async function load() {
    if (!cursor) return;
    const result = await getRepoTags(owner, repo, { cursor, limit: 30 });
    if ("error" in result) return;
    setMore((m) => [...m, ...result.tags]);
    setCursor(result.nextCursor);
  }

  return (
    <>
      {more.length > 0 && (
        <div className="mt-3 border border-border rounded-lg bg-surface overflow-hidden">
          <ul>
            {more.map((tag, i) => (
              <li
                key={tag.name}
                className={`px-4 py-3 flex items-start justify-between gap-4 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/${owner}/${repo}/tree/${encodeURIComponent(tag.name)}`}
                      className="text-text-link font-medium hover:underline flex items-center gap-1.5"
                    >
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
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      {tag.name}
                    </Link>
                    <Link
                      to={`/${owner}/${repo}/commit/${tag.commitOid}`}
                      className="text-xs font-mono text-text-link hover:underline"
                    >
                      {tag.shortOid}
                    </Link>
                  </div>
                  {tag.subject && (
                    <p className="text-sm text-text-secondary mt-1 truncate">{tag.subject}</p>
                  )}
                  <p className="text-xs text-text-secondary mt-1">
                    {tag.authorName}{" "}
                    <time
                      dateTime={new Date(tag.authorTimestamp * 1000).toISOString()}
                      title={new Date(tag.authorTimestamp * 1000).toLocaleString()}
                    >
                      {formatRelativeDate(tag.authorTimestamp)}
                    </time>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Link
                    to={`/${owner}/${repo}/commits/${encodeURIComponent(tag.name)}`}
                    className="text-xs text-text-link hover:underline"
                  >
                    Commits
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <LoadMore hasMore={cursor != null} onLoad={load} />
    </>
  );
}
