"use client";

import { useState } from "react";
import { Link } from "react-flight-router/client";
import { timeAgo } from "../lib/time";
import { getEditHistory } from "../lib/server/search";
import {
  updatePullRequest,
  createPRComment,
  updatePRComment,
  mergePullRequest,
} from "../lib/server/pulls";
import { previewMarkdown } from "../lib/server/markdown-preview";
import { MarkdownEditor } from "../components/markdown-editor.client";
import { MarkdownCopyButtons } from "../components/markdown-copy-buttons.client";
import { Avatar } from "../components/avatar";

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

interface PR {
  id: string;
  number: number;
  title: string;
  body: string | null;
  status: string;
  author: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUploadId?: string | null;
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
  bodyHtml?: string;
  author: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUploadId?: string | null;
  createdAt: string;
  updatedAt?: string;
  editCount?: number;
  lastEditedAt?: string | null;
}

interface PipelineRunSummary {
  number: number;
  status: string;
  pipelineName: string;
}

export function PullConversationView({
  owner,
  repo,
  prNumber,
  pr,
  setPr,
  prBodyHtml,
  setPrBodyHtml,
  commentsList,
  setCommentsList,
  user,
  pipelineRun,
}: {
  owner: string;
  repo: string;
  prNumber: string;
  pr: PR | null;
  setPr: React.Dispatch<React.SetStateAction<PR | null>>;
  prBodyHtml: string;
  setPrBodyHtml: React.Dispatch<React.SetStateAction<string>>;
  commentsList: Comment[];
  setCommentsList: React.Dispatch<React.SetStateAction<Comment[]>>;
  user: { username: string } | null;
  pipelineRun?: PipelineRunSummary | null;
}) {
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"merge" | "squash" | "rebase">("merge");
  const [mergeCommitMessage, setMergeCommitMessage] = useState(pr?.title ?? "");
  const [deleteBranch, setDeleteBranch] = useState(true);

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
    const result = await updatePullRequest(owner, repo, Number(prNumber), {
      body: editBody,
    });
    if (!result.error) {
      const trimmed = editBody.trim();
      setPr({
        ...pr,
        body: trimmed || null,
        editCount: (pr.editCount || 0) + 1,
        lastEditedAt: new Date().toISOString(),
      });
      try {
        const { html } = await previewMarkdown(trimmed);
        setPrBodyHtml(html);
      } catch {
        setPrBodyHtml("");
      }
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
    const result = await updatePRComment(
      owner,
      repo,
      Number(prNumber),
      comment.id,
      editCommentBody,
    );
    if (!result.error) {
      const trimmed = editCommentBody.trim();
      let html = "";
      try {
        const r = await previewMarkdown(trimmed);
        html = r.html;
      } catch {
        html = "";
      }
      setCommentsList(
        commentsList.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                body: trimmed,
                bodyHtml: html,
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
    const result = await createPRComment(owner, repo, Number(prNumber), newComment);
    if (!result.error && result.comment) {
      let html = "";
      try {
        const r = await previewMarkdown(result.comment.body || "");
        html = r.html;
      } catch {
        html = "";
      }
      setCommentsList([...commentsList, { ...result.comment, bodyHtml: html }]);
      setNewComment("");
    }
    setSubmitting(false);
  }

  async function handleMerge() {
    if (!pr) return;
    setMerging(true);
    const result = await mergePullRequest(owner, repo, Number(prNumber), {
      strategy: mergeStrategy,
      commitMessage: mergeCommitMessage.trim() || undefined,
      deleteBranch,
    });
    if (result.error) {
      alert(result.error);
    } else {
      setPr((prev) => (prev ? { ...prev, status: "merged" } : prev));
    }
    setMerging(false);
  }

  async function toggleStatus() {
    if (!pr) return;
    const newStatus = pr.status === "open" ? "closed" : "open";
    const result = await updatePullRequest(owner, repo, Number(prNumber), {
      status: newStatus as "open" | "closed",
    });
    if (!result.error) setPr({ ...pr, status: newStatus });
  }

  return (
    <>
      {/* PR body */}
      <div className="border border-border rounded-lg mb-4">
        <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Link to={`/${pr.author}`} className="shrink-0 hover:no-underline">
              <Avatar
                user={{
                  username: pr.author,
                  avatarUploadId: pr.authorAvatarUploadId ?? null,
                  displayName: pr.authorDisplayName ?? null,
                }}
                size="sm"
              />
            </Link>
            <Link to={`/${pr.author}`} className="hover:underline">
              {pr.author}
            </Link>
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
            <div className="mb-3">
              <MarkdownEditor
                value={editBody}
                onChange={setEditBody}
                minRows={8}
                placeholder="Pull request description..."
              />
            </div>
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
        ) : pr.body ? (
          prBodyHtml ? (
            <MarkdownCopyButtons
              className="markdown-body px-4 py-3 text-sm text-text-primary"
              html={prBodyHtml}
            />
          ) : (
            <div className="px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">{pr.body}</div>
          )
        ) : (
          <div className="px-4 py-3 text-sm text-text-primary">
            <span className="text-text-secondary italic">No description provided.</span>
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
              <span className="flex items-center gap-2">
                <Link to={`/${comment.author}`} className="shrink-0 hover:no-underline">
                  <Avatar
                    user={{
                      username: comment.author,
                      avatarUploadId: comment.authorAvatarUploadId ?? null,
                      displayName: comment.authorDisplayName ?? null,
                    }}
                    size="sm"
                  />
                </Link>
                <Link
                  to={`/${comment.author}`}
                  className="text-text-primary font-bold hover:underline"
                >
                  {comment.author}
                </Link>
                <span className="text-text-secondary">commented {timeAgo(comment.createdAt)}</span>
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
                <div className="mb-3">
                  <MarkdownEditor
                    value={editCommentBody}
                    onChange={setEditCommentBody}
                    minRows={4}
                  />
                </div>
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
            ) : comment.bodyHtml ? (
              <MarkdownCopyButtons
                className="markdown-body px-4 py-3 text-sm text-text-primary"
                html={comment.bodyHtml}
              />
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

      {/* Checks region — shown above the merge box so reviewers can see CI
       * state at a glance. When no pipeline has run on the source branch, we
       * still render an empty-state slot so the absence is *visible* (the
       * audit feedback was that silent absence is worse than an explicit
       * "no checks configured" message). */}
      {pr.status === "open" && (
        <div className="border border-border rounded-lg mb-4">
          <div className="px-4 py-2 bg-surface-secondary border-b border-border text-sm font-medium text-text-primary">
            Checks
          </div>
          <div className="px-4 py-3">
            {pipelineRun ? (
              <Link
                to={`/${owner}/${repo}/pipelines/runs/${pipelineRun.number}`}
                className="flex items-center gap-3 text-sm hover:no-underline"
                title={`Pipeline ${pipelineRun.pipelineName} #${pipelineRun.number}`}
              >
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${
                    pipelineRun.status === "success"
                      ? "border-success/40 text-success bg-success/15"
                      : pipelineRun.status === "failure" || pipelineRun.status === "timed_out"
                        ? "border-danger/40 text-danger bg-danger/15"
                        : pipelineRun.status === "running" || pipelineRun.status === "queued"
                          ? "border-warning/40 text-warning bg-warning/15"
                          : "border-border text-text-secondary bg-surface-secondary"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {pipelineRun.status}
                </span>
                <span className="text-text-primary font-medium">{pipelineRun.pipelineName}</span>
                <span className="text-text-secondary">#{pipelineRun.number}</span>
                <span className="ml-auto text-xs text-text-link hover:underline">View run →</span>
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-secondary">
                  No pipelines have run on{" "}
                  <code className="text-xs px-1 bg-surface-secondary rounded">
                    {pr.sourceBranch}
                  </code>{" "}
                  yet.
                </span>
                <Link
                  to={`/${owner}/${repo}/pipelines/config`}
                  className="text-xs text-text-link hover:underline whitespace-nowrap"
                >
                  Configure pipelines →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Merge box */}
      {pr.status === "open" && user && user.username === owner && (
        <div className="border border-success/30 rounded-lg p-4 mb-4 bg-success/5">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <p className="text-sm text-text-primary font-medium">
              This pull request can be merged.
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-text-secondary">Strategy</label>
              <div
                className="inline-flex border border-border rounded-md overflow-hidden text-xs font-medium"
                role="radiogroup"
                aria-label="Merge strategy"
              >
                {(
                  [
                    { value: "merge", label: "Merge", disabled: false, title: "" },
                    { value: "squash", label: "Squash", disabled: false, title: "" },
                    {
                      value: "rebase",
                      label: "Rebase",
                      disabled: true,
                      title: "Rebase merging not yet supported",
                    },
                  ] as const
                ).map((opt, i) => {
                  const active = mergeStrategy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={opt.disabled}
                      title={opt.title}
                      onClick={() => !opt.disabled && setMergeStrategy(opt.value)}
                      className={`px-3 py-1 transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                        active
                          ? "bg-selected-bg text-selected-text"
                          : opt.disabled
                            ? "text-text-secondary opacity-50 cursor-not-allowed"
                            : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <input
            type="text"
            value={mergeCommitMessage}
            onChange={(e) => setMergeCommitMessage(e.target.value)}
            placeholder="Commit message"
            className="w-full mb-3 px-3 py-2 border border-border rounded-md bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={deleteBranch}
                onChange={(e) => setDeleteBranch(e.target.checked)}
              />
              Delete{" "}
              <code className="text-xs px-1 bg-surface-secondary rounded">{pr.sourceBranch}</code>{" "}
              after merge
            </label>
            <button
              onClick={handleMerge}
              disabled={merging || mergeStrategy === "rebase"}
              className="btn-primary btn-sm"
              title={mergeStrategy === "rebase" ? "Rebase merging not yet supported" : undefined}
            >
              {merging ? "Merging..." : "Merge pull request"}
            </button>
          </div>
        </div>
      )}

      {pr.status === "merged" && (
        <div className="border border-merged/30 rounded-lg p-4 mb-4 bg-merged-bg">
          <p className="text-sm text-merged font-medium">
            This pull request was merged
            {pr.mergedBy ? (
              <>
                {" "}
                by{" "}
                <Link to={`/${pr.mergedBy}`} className="hover:underline">
                  {pr.mergedBy}
                </Link>
              </>
            ) : (
              ""
            )}
            .
          </p>
        </div>
      )}

      {/* Comment form */}
      {user && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <form onSubmit={handleComment}>
            <div className="mb-3">
              <MarkdownEditor
                value={newComment}
                onChange={setNewComment}
                minRows={4}
                placeholder="Leave a comment..."
              />
            </div>
            <div className="flex items-center justify-between">
              {pr.status !== "merged" &&
                (user.username === pr.author || user.username === owner) && (
                  <button type="button" onClick={toggleStatus} className="btn-secondary btn-sm">
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
