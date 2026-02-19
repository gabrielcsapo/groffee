"use client";

import { useState, useEffect } from "react";
import { timeAgo } from "../lib/time";
import { getEditHistory } from "../lib/server/search";
import { getSessionUser } from "../lib/server/auth";
import { updateIssue, createIssueComment, updateIssueComment } from "../lib/server/issues";

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

interface Issue {
  id: string;
  number: number;
  title: string;
  body: string | null;
  status: string;
  author: string;
  authorId?: string;
  createdAt: string;
  editCount?: number;
  lastEditedAt?: string | null;
}

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

export function IssueDetailView({
  owner,
  repo,
  issueNumber,
  initialIssue,
  initialComments,
}: {
  owner: string;
  repo: string;
  issueNumber: string;
  initialIssue: Issue | null;
  initialComments: Comment[];
}) {
  const [issue, setIssue] = useState<Issue | null>(initialIssue);
  const [commentsList, setCommentsList] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);

  // Issue edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [commentEditSaving, setCommentEditSaving] = useState(false);

  // History state
  const [historyTarget, setHistoryTarget] = useState<{
    type: "issue" | "comment";
    id: string;
  } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<EditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getSessionUser()
      .then((u) => {
        if (u) setUser({ username: u.username });
      })
      .catch(() => {});
  }, []);

  const canEditIssue = user && issue && (user.username === issue.author || user.username === owner);

  function canEditComment(comment: Comment) {
    return user && (user.username === comment.author || user.username === owner);
  }

  function startEditIssue() {
    if (!issue) return;
    setEditTitle(issue.title);
    setEditBody(issue.body || "");
    setEditing(true);
  }

  async function saveIssueEdit() {
    if (!issue || !editTitle.trim()) return;
    setEditSaving(true);
    const result = await updateIssue(owner, repo, Number(issueNumber), {
      title: editTitle,
      body: editBody,
    });
    if (!result.error) {
      setIssue({
        ...issue,
        title: editTitle.trim(),
        body: editBody.trim() || null,
        editCount: (issue.editCount || 0) + 1,
        lastEditedAt: new Date().toISOString(),
      });
      setEditing(false);
    }
    setEditSaving(false);
  }

  function startEditComment(comment: Comment) {
    setEditingCommentId(comment.id);
    setEditCommentBody(comment.body);
  }

  async function saveCommentEdit(comment: Comment) {
    if (!editCommentBody.trim()) return;
    setCommentEditSaving(true);

    const result = await updateIssueComment(
      owner,
      repo,
      Number(issueNumber),
      comment.id,
      editCommentBody,
    );

    if (!result.error) {
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

  async function showHistory(type: "issue" | "comment", id: string) {
    if (historyTarget?.type === type && historyTarget?.id === id) {
      setHistoryTarget(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryTarget({ type, id });
    try {
      const targetType = type === "issue" ? "issue" : "comment";
      const entries = await getEditHistory(targetType, id);
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

    const result = await createIssueComment(owner, repo, Number(issueNumber), newComment);

    if (!result.error && result.comment) {
      setCommentsList([...commentsList, result.comment]);
      setNewComment("");
    }
    setSubmitting(false);
  }

  async function toggleStatus() {
    if (!issue) return;
    const newStatus = issue.status === "open" ? "closed" : "open";
    const result = await updateIssue(owner, repo, Number(issueNumber), {
      status: newStatus as "open" | "closed",
    });
    if (!result.error) setIssue({ ...issue, status: newStatus });
  }

  if (!issue) {
    return (
      <div className="max-w-3xl mx-auto mt-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Issue not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-4">
      {/* Header */}
      <div className="mb-6">
        {editing ? (
          <div className="mb-4">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-lg font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary mb-2"
            />
          </div>
        ) : (
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            {issue.title} <span className="text-text-secondary font-normal">#{issue.number}</span>
            {canEditIssue && !editing && (
              <button
                onClick={startEditIssue}
                className="ml-2 text-sm font-normal text-text-secondary hover:text-text-primary"
                title="Edit issue"
              >
                Edit
              </button>
            )}
          </h1>
        )}
        <div className="flex items-center gap-3">
          <span className={`badge ${issue.status === "open" ? "badge-open" : "badge-closed"}`}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              {issue.status === "open" && <circle cx="8" cy="8" r="3" />}
              {issue.status === "closed" && (
                <path d="M4 8l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
              )}
            </svg>
            {issue.status === "open" ? "Open" : "Closed"}
          </span>
          <span className="text-sm text-text-secondary">
            <strong>{issue.author}</strong> opened this issue {timeAgo(issue.createdAt)}
          </span>
        </div>
      </div>

      {/* Issue body */}
      <div className="border border-border rounded-lg mb-4">
        <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary flex items-center justify-between">
          <span className="flex items-center">
            {issue.author}
            <EditedIndicator
              editCount={issue.editCount}
              lastEditedAt={issue.lastEditedAt}
              onViewHistory={() => showHistory("issue", issue.id)}
            />
          </span>
          {canEditIssue && !editing && (
            <button
              onClick={startEditIssue}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="p-4">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y mb-3"
              placeholder="Issue description..."
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="btn-sm rounded-md border border-border text-text-secondary hover:text-text-primary font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveIssueEdit}
                disabled={editSaving || !editTitle.trim()}
                className="btn-primary btn-sm"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">
            {issue.body || (
              <span className="text-text-secondary italic">No description provided.</span>
            )}
          </div>
        )}
      </div>

      {/* Issue edit history */}
      {historyTarget?.type === "issue" &&
        historyTarget.id === issue.id &&
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

      {/* Add comment / close-reopen */}
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
              <button
                type="button"
                onClick={toggleStatus}
                className={`btn-sm rounded-md border font-medium ${
                  issue.status === "open"
                    ? "border-danger/30 text-danger hover:bg-danger/5"
                    : "border-success/30 text-success hover:bg-success/5"
                }`}
              >
                {issue.status === "open" ? "Close issue" : "Reopen issue"}
              </button>
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
    </div>
  );
}
