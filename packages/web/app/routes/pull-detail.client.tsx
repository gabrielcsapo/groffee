"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { timeAgo } from "../lib/time";
import { getSessionUser } from "../lib/server/auth";
import { updatePullRequest } from "../lib/server/pulls";

interface PR {
  id: string;
  number: number;
  title: string;
  body: string | null;
  status: string;
  author: string;
  authorId?: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  mergedBy?: string | null;
  mergedAt?: string | null;
  editCount?: number;
  lastEditedAt?: string | null;
}

interface Comment {
  id: string;
  body: string;
  author: string;
  authorId?: string;
  createdAt: string;
  updatedAt?: string;
  editCount?: number;
  lastEditedAt?: string | null;
}

interface DiffFile {
  oldPath: string;
  newPath: string;
  status: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

export interface PullDetailContextValue {
  owner: string;
  repo: string;
  prNumber: string;
  pr: PR | null;
  setPr: React.Dispatch<React.SetStateAction<PR | null>>;
  diff: DiffFile[] | null;
  commentsList: Comment[];
  setCommentsList: React.Dispatch<React.SetStateAction<Comment[]>>;
  user: { username: string } | null;
}

const PullDetailContext = createContext<PullDetailContextValue | null>(null);

export function usePullDetailContext() {
  const ctx = useContext(PullDetailContext);
  if (!ctx) throw new Error("usePullDetailContext must be used within PullDetailLayout");
  return ctx;
}

export function PullDetailLayout({
  owner,
  repo,
  prNumber,
  initialPR,
  initialDiff,
  initialComments,
  children,
}: {
  owner: string;
  repo: string;
  prNumber: string;
  initialPR: PR | null;
  initialDiff: DiffFile[] | null;
  initialComments: Comment[];
  children: ReactNode;
}) {
  const location = useLocation();
  const isFilesTab = location.pathname.endsWith("/files-changed");
  const basePath = `/${owner}/${repo}/pull/${prNumber}`;

  const [pr, setPr] = useState<PR | null>(initialPR);
  const [diff] = useState<DiffFile[] | null>(initialDiff);
  const [commentsList, setCommentsList] = useState<Comment[]>(initialComments);
  const [user, setUser] = useState<{ username: string } | null>(null);

  // PR title edit state (kept in layout since title is in header)
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    getSessionUser()
      .then((u) => {
        if (u) setUser({ username: u.username });
      })
      .catch(() => {});
  }, []);

  const canEditPR = user && pr && (user.username === pr.author || user.username === owner);

  function startEditTitle() {
    if (!pr) return;
    setEditTitle(pr.title);
    setEditing(true);
  }

  async function saveTitle() {
    if (!pr || !editTitle.trim()) return;
    const result = await updatePullRequest(owner, repo, Number(prNumber), {
      title: editTitle,
    });
    if (!result.error) {
      setPr({
        ...pr,
        title: editTitle.trim(),
        editCount: (pr.editCount || 0) + 1,
        lastEditedAt: new Date().toISOString(),
      });
      setEditing(false);
    }
  }

  if (!pr) {
    return (
      <div className="max-w-4xl mx-auto mt-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Pull request not found</h1>
        </div>
      </div>
    );
  }

  const statusBadge =
    pr.status === "open" ? "badge-open" : pr.status === "merged" ? "badge-merged" : "badge-closed";

  return (
    <PullDetailContext.Provider
      value={{ owner, repo, prNumber, pr, setPr, diff, commentsList, setCommentsList, user }}
    >
      <div className="max-w-5xl mx-auto mt-4">
        {/* Header */}
        <div className="mb-6">
          {editing ? (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 px-3 py-2 border border-border rounded-md bg-surface text-lg font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <button
                onClick={saveTitle}
                disabled={!editTitle.trim()}
                className="btn-primary btn-sm"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="btn-sm rounded-md border border-border text-text-secondary hover:text-text-primary font-medium"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-semibold text-text-primary mb-2">
              {pr.title} <span className="text-text-secondary font-normal">#{pr.number}</span>
              {canEditPR && (
                <button
                  onClick={startEditTitle}
                  className="ml-2 text-sm font-normal text-text-secondary hover:text-text-primary"
                  title="Edit title"
                >
                  Edit
                </button>
              )}
            </h1>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`badge ${statusBadge}`}>
              {pr.status === "open" ? "Open" : pr.status === "merged" ? "Merged" : "Closed"}
            </span>
            <span className="text-sm text-text-secondary">
              <Link to={`/${pr.author}`} className="font-semibold text-text-primary hover:underline">{pr.author}</Link> wants to merge
              <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                {pr.sourceBranch}
              </code>
              into
              <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                {pr.targetBranch}
              </code>
            </span>
            {pr.editCount && pr.editCount > 0 && (
              <span
                className="text-xs text-text-secondary"
                title={`Edited ${pr.editCount} time${pr.editCount > 1 ? "s" : ""}${pr.lastEditedAt ? ` - last ${timeAgo(pr.lastEditedAt)}` : ""}`}
              >
                (edited)
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          <Link
            to={basePath}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${!isFilesTab ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
          >
            Conversation
          </Link>
          <Link
            to={`${basePath}/files-changed`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${isFilesTab ? "border-primary text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
          >
            Files changed {diff ? `(${diff.length})` : ""}
          </Link>
        </div>

        {/* Child route content */}
        {children}
      </div>
    </PullDetailContext.Provider>
  );
}
