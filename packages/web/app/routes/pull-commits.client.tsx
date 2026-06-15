"use client";

import { Link } from "react-flight-router/client";
import { Avatar } from "../components/avatar";
import { timeAgo } from "../lib/time";

export interface PRCommit {
  oid: string;
  message: string;
  author: string;
  authorEmail: string;
  authorTimestamp: number;
  authorUsername: string | null;
  authorAvatarUploadId: string | null;
  pipelineStatus: "queued" | "running" | "success" | "failure" | "cancelled" | "timed_out" | null;
  pipelineRunNumber: number | null;
}

function shortOid(oid: string) {
  return oid.slice(0, 7);
}

function firstLine(message: string) {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}

function PipelineDot({ status }: { status: PRCommit["pipelineStatus"] }) {
  if (!status) return null;
  const cls =
    status === "success"
      ? "text-success bg-success/15 border-success/40"
      : status === "failure" || status === "timed_out"
        ? "text-danger bg-danger/15 border-danger/40"
        : status === "running" || status === "queued"
          ? "text-warning bg-warning/15 border-warning/40"
          : "text-text-secondary bg-surface-secondary border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${cls}`}
      title={`Pipeline ${status}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
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
        {commits.map((c) => {
          const username = c.authorUsername;
          return (
            <li
              key={c.oid}
              className="px-4 py-3 flex items-center gap-3 hover:bg-surface-secondary/40 group"
            >
              {/* Author avatar — falls back to the monogram if we couldn't
               * match the commit email to a registered user. */}
              <Avatar
                user={{
                  username: username ?? c.author,
                  avatarUploadId: c.authorAvatarUploadId,
                }}
                size="sm"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/${owner}/${repo}/commit/${c.oid}`}
                  className="text-sm text-text-primary font-medium hover:underline truncate block"
                >
                  {firstLine(c.message)}
                </Link>
                <div className="text-xs text-text-secondary mt-0.5">
                  {username ? (
                    <Link
                      to={`/${username}`}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {username}
                    </Link>
                  ) : (
                    <span className="font-medium text-text-primary">{c.author}</span>
                  )}{" "}
                  committed{" "}
                  {c.authorTimestamp
                    ? timeAgo(new Date(c.authorTimestamp * 1000).toISOString())
                    : ""}
                </div>
              </div>
              {c.pipelineStatus && c.pipelineRunNumber != null ? (
                <Link
                  to={`/${owner}/${repo}/pipelines/runs/${c.pipelineRunNumber}`}
                  className="shrink-0 hover:no-underline"
                  title={`Pipeline #${c.pipelineRunNumber} (${c.pipelineStatus})`}
                >
                  <PipelineDot status={c.pipelineStatus} />
                </Link>
              ) : (
                <PipelineDot status={c.pipelineStatus} />
              )}
              <Link
                to={`/${owner}/${repo}/commit/${c.oid}`}
                className="text-xs font-mono text-text-secondary hover:text-text-primary border border-border rounded px-2 py-1 shrink-0"
                title={c.oid}
              >
                {shortOid(c.oid)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
