"use client";

import { useState } from "react";
import { timeAgo } from "../lib/time";
import { getEditHistory } from "../lib/actions";
import { usePullDetailContext } from "./pull-detail.client";

interface EditEntry {
  id: string;
  previousTitle: string | null;
  previousBody: string | null;
  editedBy: string;
  createdAt: string | null;
}

function EditedIndicator({
  editCount,
  lastEditedAt,
  onViewHistory,
}: {
  editCount?: number;
  lastEditedAt?: string | null;
  onViewHistory: () => void;
}) {
  if (!editCount || editCount === 0) return null;
  return (
    <button
      onClick={onViewHistory}
      className="text-xs text-text-secondary hover:underline ml-1"
      title={`Edited ${editCount} time${editCount > 1 ? "s" : ""}${lastEditedAt ? ` - last ${timeAgo(lastEditedAt)}` : ""}`}
    >
      (edited)
    </button>
  );
}

function EditHistoryPanel({ entries, onClose }: { entries: EditEntry[]; onClose: () => void }) {
  return (
    <div className="border border-border rounded-lg mt-2 mb-4 bg-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-text-primary">Edit History</h3>
        <button onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary">
          &times;
        </button>
      </div>
      {entries.length === 0 && <p className="text-xs text-text-secondary">No edit history.</p>}
      {entries.map((entry) => (
        <div key={entry.id} className="border-b border-border last:border-0 py-2">
          <div className="text-xs text-text-secondary">
            {entry.editedBy} edited {entry.createdAt ? timeAgo(entry.createdAt) : ""}
          </div>
          {entry.previousTitle && (
            <div className="text-xs text-text-secondary mt-1">
              <strong>Title:</strong> {entry.previousTitle}
            </div>
          )}
          {entry.previousBody !== null && entry.previousBody !== undefined && (
            <div className="text-sm text-text-primary mt-1 whitespace-pre-wrap bg-surface-secondary rounded p-2">
              {entry.previousBody}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function PullConversationView() {
  const { owner, repo, prNumber, pr, setPr, commentsList, setCommentsList, user } =
    usePullDetailContext();

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [merging, setMerging] = useState(false);

  // PR body edit state
  const [editingBody, setEditingBody] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [commentEditSaving, setCommentEditSaving] = useState(false);

  // History state
  const [historyTarget, setHistoryTarget] = useState<{
    type: "pull_request" | "comment";
    id: string;
  } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<EditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  if (!pr) return null;

  const canEditPR = user && (user.username === pr.author || user.username === owner);

  function canEditComment(comment: { author: string }) {
    return user && (user.username === comment.author || user.username === owner);
  }

  function startEditBody() {
    if (!pr) return;
    setEditBody(pr.body || "");
    setEditingBody(true);
  }

  async function saveBodyEdit() {
    if (!pr) return;
    setEditSaving(true);
    const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    if (res.ok) {
      setPr({
        ...pr,
        body: editBody.trim() || null,
        editCount: (pr.editCount || 0) + 1,
        lastEditedAt: new Date().toISOString(),
      });
      setEditingBody(false);
    }
    setEditSaving(false);
  }

  function startEditComment(comment: { id: string; body: string }) {
    setEditingCommentId(comment.id);
    setEditCommentBody(comment.body);
  }

  async function saveCommentEdit(comment: { id: string }) {
    if (!editCommentBody.trim()) return;
    setCommentEditSaving(true);
    const res = await fetch(
      `/api/repos/${owner}/${repo}/pulls/${prNumber}/comments/${comment.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editCommentBody }),
      },
    );
    if (res.ok) {
      setCommentsList(
        commentsList.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                body: editCommentBody.trim(),
                editCount: (c.editCount || 0) + 1,
                lastEditedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      setEditingCommentId(null);
    }
    setCommentEditSaving(false);
  }

  async function showHistory(type: "pull_request" | "comment", id: string) {
    if (historyTarget?.type === type && historyTarget?.id === id) {
      setHistoryTarget(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryTarget({ type, id });
    try {
      const entries = await getEditHistory(type, id);
      setHistoryEntries(entries);
    } catch {
      setHistoryEntries([]);
    }
    setHistoryLoading(false);
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    });
    const data = await res.json();
    if (res.ok) {
      setCommentsList([...commentsList, data.comment]);
      setNewComment("");
    }
    setSubmitting(false);
  }

  async function handleMerge() {
    setMerging(true);
    const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      setPr((prev) => (prev ? { ...prev, status: "merged" } : prev));
    } else {
      alert(data.error || "Merge failed");
    }
    setMerging(false);
  }

  async function toggleStatus() {
    if (!pr) return;
    const newStatus = pr.status === "open" ? "closed" : "open";
    const res = await fetch(`/api/repos/${owner}/${repo}/pulls/${prNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setPr({ ...pr, status: newStatus });
  }

  return (
    <>
      {/* PR body */}
      <div className="border border-border rounded-lg mb-4">
        <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary flex items-center justify-between">
          <span className="flex items-center">
            {pr.author}
            <EditedIndicator
              editCount={pr.editCount}
              lastEditedAt={pr.lastEditedAt}
              onViewHistory={() => showHistory("pull_request", pr.id)}
            />
          </span>
          {canEditPR && !editingBody && (
            <button
              onClick={startEditBody}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Edit
            </button>
          )}
        </div>
        {editingBody ? (
          <div className="p-4">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y mb-3"
              placeholder="Pull request description..."
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditingBody(false)}
                className="btn-sm rounded-md border border-border text-text-secondary hover:text-text-primary font-medium"
              >
                Cancel
              </button>
              <button onClick={saveBodyEdit} disabled={editSaving} className="btn-primary btn-sm">
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">
            {pr.body || (
              <span className="text-text-secondary italic">No description provided.</span>
            )}
          </div>
        )}
      </div>

      {/* PR edit history */}
      {historyTarget?.type === "pull_request" &&
        historyTarget.id === pr.id &&
        (historyLoading ? (
          <div className="text-xs text-text-secondary mb-4">Loading history...</div>
        ) : (
          <EditHistoryPanel entries={historyEntries} onClose={() => setHistoryTarget(null)} />
        ))}

      {/* Comments */}
      {commentsList.map((comment) => (
        <div key={comment.id}>
          <div className="border border-border rounded-lg mb-2">
            <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm flex items-center justify-between">
              <span className="flex items-center">
                <strong className="text-text-primary">{comment.author}</strong>
                <span className="text-text-secondary ml-1">
                  commented {timeAgo(comment.createdAt)}
                </span>
                <EditedIndicator
                  editCount={comment.editCount}
                  lastEditedAt={comment.lastEditedAt}
                  onViewHistory={() => showHistory("comment", comment.id)}
                />
              </span>
              {canEditComment(comment) && editingCommentId !== comment.id && (
                <button
                  onClick={() => startEditComment(comment)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Edit
                </button>
              )}
            </div>
            {editingCommentId === comment.id ? (
              <div className="p-4">
                <textarea
                  value={editCommentBody}
                  onChange={(e) => setEditCommentBody(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y mb-3"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setEditingCommentId(null)}
                    className="btn-sm rounded-md border border-border text-text-secondary hover:text-text-primary font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveCommentEdit(comment)}
                    disabled={commentEditSaving || !editCommentBody.trim()}
                    className="btn-primary btn-sm"
                  >
                    {commentEditSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">
                {comment.body}
              </div>
            )}
          </div>

          {/* Comment edit history */}
          {historyTarget?.type === "comment" &&
            historyTarget.id === comment.id &&
            (historyLoading ? (
              <div className="text-xs text-text-secondary mb-4">Loading history...</div>
            ) : (
              <EditHistoryPanel entries={historyEntries} onClose={() => setHistoryTarget(null)} />
            ))}
        </div>
      ))}

      {/* Merge box */}
      {pr.status === "open" && user && (
        <div className="border border-success/30 rounded-lg p-4 mb-4 bg-success/5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-primary font-medium">
              This pull request can be merged.
            </p>
            <button onClick={handleMerge} disabled={merging} className="btn-primary btn-sm">
              {merging ? "Merging..." : "Merge pull request"}
            </button>
          </div>
        </div>
      )}

      {pr.status === "merged" && (
        <div className="border border-merged/30 rounded-lg p-4 mb-4 bg-merged-bg">
          <p className="text-sm text-merged font-medium">
            This pull request was merged{pr.mergedBy ? ` by ${pr.mergedBy}` : ""}.
          </p>
        </div>
      )}

      {/* Comment form */}
      {user && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <form onSubmit={handleComment}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={4}
              placeholder="Leave a comment..."
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y mb-3"
            />
            <div className="flex items-center justify-between">
              {pr.status !== "merged" && (
                <button
                  type="button"
                  onClick={toggleStatus}
                  className={`btn-sm rounded-md border font-medium ${
                    pr.status === "open"
                      ? "border-danger/30 text-danger hover:bg-danger/5"
                      : "border-success/30 text-success hover:bg-success/5"
                  }`}
                >
                  {pr.status === "open" ? "Close pull request" : "Reopen pull request"}
                </button>
              )}
              {pr.status === "merged" && <div />}
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="btn-primary btn-sm"
              >
                Comment
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
