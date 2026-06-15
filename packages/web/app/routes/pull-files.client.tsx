"use client";

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { Link } from "react-flight-router/client";
import { Avatar } from "../components/avatar";
import { timeAgo } from "../lib/time";
import {
  createDiffComment,
  updateDiffComment,
  deleteDiffComment,
  resolveDiffComment,
} from "../lib/server/pulls";
import { previewMarkdown } from "../lib/server/markdown-preview";
import { MarkdownEditor } from "../components/markdown-editor.client";
import { MarkdownCopyButtons } from "../components/markdown-copy-buttons.client";

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
    /** Optional, server-side Shiki output, parallel to `lines`. */
    highlightedLines?: (string | null)[];
  }>;
}

export interface DiffComment {
  id: string;
  pullRequestId: string;
  parentId: string | null;
  filePath: string;
  commitOid: string;
  side: "old" | "new";
  lineNumber: number;
  body: string;
  bodyHtml?: string;
  resolved: boolean;
  author: string;
  authorDisplayName?: string | null;
  authorAvatarUploadId?: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

const INITIAL_RENDER_COUNT = 20;
const BATCH_SIZE = 30;

function lineKey(filePath: string, side: "old" | "new", lineNumber: number) {
  return `${filePath}::${side}::${lineNumber}`;
}

// ---------------------------------------------------------------------------
// CommentForm — inline write/edit form used by every comment affordance.
// ---------------------------------------------------------------------------

function CommentForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  submitLabel,
  placeholder,
}: {
  initial?: string;
  submitting: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  submitLabel: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <div>
      <div className="mb-2">
        <MarkdownEditor
          value={value}
          onChange={setValue}
          minRows={3}
          placeholder={placeholder}
          autoFocus
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="btn-sm rounded-md border border-border text-text-secondary hover:text-text-primary font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => value.trim() && onSubmit(value.trim())}
          disabled={submitting || !value.trim()}
          className="btn-primary btn-sm"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentBlock — single comment rendering (with edit / delete / resolve).
// ---------------------------------------------------------------------------

function CommentBlock({
  comment,
  currentUser,
  ownerName,
  onEdit,
  onDelete,
  onResolveToggle,
  isThreadRoot,
}: {
  comment: DiffComment;
  currentUser: { username: string } | null;
  ownerName: string;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResolveToggle: (id: string, resolved: boolean) => Promise<void>;
  isThreadRoot: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canEdit =
    currentUser && (currentUser.username === comment.author || currentUser.username === ownerName);

  return (
    <div className="border border-border rounded-md bg-surface my-1.5">
      <div className="px-3 py-1.5 border-b border-border bg-surface-secondary text-xs flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Link to={`/${comment.author}`} className="shrink-0 hover:no-underline">
            <Avatar
              user={{
                username: comment.author,
                avatarUploadId: comment.authorAvatarUploadId ?? null,
                displayName: comment.authorDisplayName ?? null,
              }}
              size="xs"
            />
          </Link>
          <Link to={`/${comment.author}`} className="font-medium text-text-primary hover:underline">
            {comment.author}
          </Link>
          <span className="text-text-secondary">commented {timeAgo(comment.createdAt)}</span>
        </span>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-text-secondary hover:text-text-primary"
            >
              Edit
            </button>
          )}
          {canEdit && (
            <button
              onClick={async () => {
                if (!confirm("Delete this comment?")) return;
                await onDelete(comment.id);
              }}
              className="text-text-secondary hover:text-danger"
            >
              Delete
            </button>
          )}
          {isThreadRoot && currentUser && (
            <button
              onClick={() => onResolveToggle(comment.id, !comment.resolved)}
              className={`font-medium ${
                comment.resolved
                  ? "text-text-secondary hover:text-text-primary"
                  : "text-success hover:underline"
              }`}
            >
              {comment.resolved ? "Unresolve" : "Resolve"}
            </button>
          )}
        </div>
      </div>
      <div className="p-3">
        {editing ? (
          <CommentForm
            initial={comment.body}
            submitting={submitting}
            onCancel={() => setEditing(false)}
            submitLabel="Save"
            onSubmit={async (body) => {
              setSubmitting(true);
              try {
                await onEdit(comment.id, body);
                setEditing(false);
              } finally {
                setSubmitting(false);
              }
            }}
          />
        ) : comment.bodyHtml ? (
          <MarkdownCopyButtons
            className="markdown-body text-sm text-text-primary"
            html={comment.bodyHtml}
          />
        ) : (
          <div className="text-sm text-text-primary whitespace-pre-wrap">{comment.body}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineThread — a thread anchored to a single (file, side, line). Renders the
// root comment, its replies, and the Reply / Resolve UI.
// ---------------------------------------------------------------------------

function InlineThread({
  threads,
  currentUser,
  ownerName,
  onCreateReply,
  onEdit,
  onDelete,
  onResolveToggle,
  collapseResolvedByDefault,
}: {
  // A "thread" here is { root: DiffComment, replies: DiffComment[] }
  threads: Array<{ root: DiffComment; replies: DiffComment[] }>;
  currentUser: { username: string } | null;
  ownerName: string;
  onCreateReply: (parentId: string, body: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResolveToggle: (id: string, resolved: boolean) => Promise<void>;
  collapseResolvedByDefault: boolean;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedResolved, setExpandedResolved] = useState<Set<string>>(new Set());

  const visibleThreads = threads.filter((t) => {
    if (!collapseResolvedByDefault) return true;
    if (!t.root.resolved) return true;
    return expandedResolved.has(t.root.id);
  });

  const collapsedCount = threads.length - visibleThreads.length;

  return (
    <div className="bg-surface-secondary border-l-2 border-text-link/40 px-3 py-2">
      {collapsedCount > 0 && (
        <button
          onClick={() => {
            const next = new Set(expandedResolved);
            for (const t of threads) if (t.root.resolved) next.add(t.root.id);
            setExpandedResolved(next);
          }}
          className="text-xs text-text-secondary hover:text-text-primary mb-2"
        >
          Show {collapsedCount} resolved thread{collapsedCount === 1 ? "" : "s"}
        </button>
      )}
      {visibleThreads.map(({ root, replies }) => (
        <div key={root.id} className="mb-2 last:mb-0">
          <CommentBlock
            comment={root}
            currentUser={currentUser}
            ownerName={ownerName}
            onEdit={onEdit}
            onDelete={onDelete}
            onResolveToggle={onResolveToggle}
            isThreadRoot
          />
          {replies.map((r) => (
            <div key={r.id} className="ml-4">
              <CommentBlock
                comment={r}
                currentUser={currentUser}
                ownerName={ownerName}
                onEdit={onEdit}
                onDelete={onDelete}
                onResolveToggle={onResolveToggle}
                isThreadRoot={false}
              />
            </div>
          ))}
          {currentUser &&
            (replyingTo === root.id ? (
              <div className="ml-4 mt-1.5">
                <CommentForm
                  submitting={submitting}
                  onCancel={() => setReplyingTo(null)}
                  submitLabel="Reply"
                  placeholder="Reply..."
                  onSubmit={async (body) => {
                    setSubmitting(true);
                    try {
                      await onCreateReply(root.id, body);
                      setReplyingTo(null);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setReplyingTo(root.id)}
                className="ml-4 mt-1 text-xs text-text-link hover:underline"
              >
                Reply
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffFileCard — single file diff with per-line inline comment affordances.
// ---------------------------------------------------------------------------

interface DiffFileCardProps {
  file: DiffFile;
  filePath: string;
  threadsByLineKey: Map<string, Array<{ root: DiffComment; replies: DiffComment[] }>>;
  currentUser: { username: string } | null;
  ownerName: string;
  newCommentTarget: { lineKey: string } | null;
  setNewCommentTarget: React.Dispatch<React.SetStateAction<{ lineKey: string } | null>>;
  onSubmitNewComment: (side: "old" | "new", lineNumber: number, body: string) => Promise<void>;
  onCreateReply: (parentId: string, body: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onResolveToggle: (id: string, resolved: boolean) => Promise<void>;
  newCommentSubmitting: boolean;
}

const DiffFileCard = memo(function DiffFileCard({
  file,
  filePath,
  threadsByLineKey,
  currentUser,
  ownerName,
  newCommentTarget,
  setNewCommentTarget,
  onSubmitNewComment,
  onCreateReply,
  onEdit,
  onDelete,
  onResolveToggle,
  newCommentSubmitting,
}: DiffFileCardProps) {
  // Per-file UI state. "Viewed" is local-only (intentional — the audit was
  // about giving reviewers a way to track progress at-a-glance, not about
  // persisting it across page loads. Server-side viewed state is a separate
  // feature.) Collapse defaults to true when viewed.
  const [viewed, setViewed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Auto-collapse when marking as viewed; auto-expand when unmarking.
  const onToggleViewed = (next: boolean) => {
    setViewed(next);
    setCollapsed(next);
  };

  // Aggregate per-file diff stats. Counts every `+`/`-` line across all
  // hunks; context lines are ignored. Memoized so we don't walk the file on
  // every render.
  const { added, removed } = useMemo(() => {
    let a = 0;
    let r = 0;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) a += 1;
        else if (line.startsWith("-")) r += 1;
      }
    }
    return { added: a, removed: r };
  }, [file]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-secondary border-b border-border sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand file" : "Collapse file"}
          aria-expanded={!collapsed}
          className="shrink-0 text-text-secondary hover:text-text-primary p-0.5 -ml-1"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}
          >
            <path d="M4 6l4 4 4-4H4z" />
          </svg>
        </button>
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            file.status === "added"
              ? "bg-diff-add-bg text-success"
              : file.status === "deleted"
                ? "bg-diff-del-bg text-danger"
                : "bg-warning-bg text-warning"
          }`}
        >
          {file.status}
        </span>
        <span className="text-sm font-medium text-text-primary font-mono truncate">{filePath}</span>
        <span className="ml-auto flex items-center gap-3 text-xs font-mono shrink-0">
          {added > 0 && <span className="text-success">+{added}</span>}
          {removed > 0 && <span className="text-danger">−{removed}</span>}
          <label className="flex items-center gap-1.5 text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={viewed}
              onChange={(e) => onToggleViewed(e.target.checked)}
              className="w-3.5 h-3.5 accent-action"
            />
            Viewed
          </label>
        </span>
      </div>
      {!collapsed && (
        <div className="overflow-x-auto">
          {file.hunks.map((hunk, hunkIdx) => {
            // Track running per-side line numbers as we walk hunk lines.
            let oldLine = hunk.oldStart;
            let newLine = hunk.newStart;
            return (
              <div key={hunkIdx}>
                <div className="text-xs text-text-secondary bg-surface-secondary px-4 py-1 font-mono border-b border-border">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>
                <table className="w-full text-sm font-mono">
                  <tbody>
                    {hunk.lines.map((line, lineIdx) => {
                      const isAdd = line.startsWith("+");
                      const isDel = line.startsWith("-");
                      const bg = isAdd ? "bg-diff-add-bg" : isDel ? "bg-diff-del-bg" : "";
                      const textColor = isAdd
                        ? "text-success"
                        : isDel
                          ? "text-danger"
                          : "text-text-primary";
                      const prefix = line[0] ?? " ";
                      const highlighted = hunk.highlightedLines?.[lineIdx] ?? null;

                      // Pick the line number for inline-comment anchoring. For
                      // additions we anchor to the new side; for deletions to
                      // the old side; context lines anchor to the new side.
                      const side: "old" | "new" = isDel ? "old" : "new";
                      const anchorLine = isDel ? oldLine : newLine;
                      const key = lineKey(filePath, side, anchorLine);
                      const threads = threadsByLineKey.get(key) || [];
                      const isAddingHere = newCommentTarget?.lineKey === key;

                      // Capture the per-side line numbers for the gutter
                      // BEFORE we advance them.
                      const oldNum = isAdd ? null : oldLine;
                      const newNum = isDel ? null : newLine;

                      // Advance counters AFTER we pick the anchor.
                      if (!isAdd) oldLine += 1;
                      if (!isDel) newLine += 1;

                      return (
                        <tr key={lineIdx} className="group">
                          <td colSpan={2} className="p-0">
                            <div className={`flex ${bg}`}>
                              {/* Old-side line number gutter */}
                              <span
                                className="shrink-0 w-10 px-2 text-right text-xs text-text-secondary select-none tabular-nums"
                                aria-hidden="true"
                              >
                                {oldNum ?? ""}
                              </span>
                              {/* New-side line number gutter */}
                              <span
                                className="shrink-0 w-10 px-2 text-right text-xs text-text-secondary select-none tabular-nums border-r border-border/50"
                                aria-hidden="true"
                              >
                                {newNum ?? ""}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  currentUser &&
                                  setNewCommentTarget(isAddingHere ? null : { lineKey: key })
                                }
                                className={`shrink-0 w-6 text-xs select-none ${
                                  currentUser
                                    ? "opacity-0 group-hover:opacity-100 text-text-link hover:underline cursor-pointer"
                                    : "opacity-0"
                                }`}
                                title={currentUser ? "Add a comment" : "Sign in to comment"}
                                tabIndex={currentUser ? 0 : -1}
                              >
                                +
                              </button>
                              <div className={`flex-1 py-0 px-2 whitespace-pre ${textColor}`}>
                                {highlighted != null ? (
                                  <>
                                    <span>{prefix}</span>
                                    <span
                                      className="shiki-line"
                                      dangerouslySetInnerHTML={{ __html: highlighted }}
                                    />
                                  </>
                                ) : (
                                  line
                                )}
                              </div>
                            </div>
                            {threads.length > 0 && (
                              <InlineThread
                                threads={threads}
                                currentUser={currentUser}
                                ownerName={ownerName}
                                onCreateReply={onCreateReply}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onResolveToggle={onResolveToggle}
                                collapseResolvedByDefault
                              />
                            )}
                            {isAddingHere && (
                              <div className="bg-surface-secondary border-l-2 border-text-link/50 px-3 py-2">
                                <CommentForm
                                  submitting={newCommentSubmitting}
                                  placeholder="Leave a review comment..."
                                  submitLabel="Add comment"
                                  onCancel={() => setNewCommentTarget(null)}
                                  onSubmit={(body) => onSubmitNewComment(side, anchorLine, body)}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// DiffSidebar — sticky file list with search filter.
// ---------------------------------------------------------------------------

function DiffSidebar({
  diff,
  fileFilter,
  setFileFilter,
  scrollToFile,
  activeFileIdx,
  threadCounts,
}: {
  diff: DiffFile[];
  fileFilter: string;
  setFileFilter: (v: string) => void;
  scrollToFile: (idx: number) => void;
  activeFileIdx: number;
  threadCounts: Map<string, { total: number; unresolved: number }>;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeFileIdx]);

  // Per-file diff stats, memoized over the diff array. Walks every line
  // once; cheap relative to the page render.
  const statsByIdx = useMemo(() => {
    const map = new Map<number, { added: number; removed: number }>();
    diff.forEach((file, idx) => {
      let added = 0;
      let removed = 0;
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith("+")) added += 1;
          else if (line.startsWith("-")) removed += 1;
        }
      }
      map.set(idx, { added, removed });
    });
    return map;
  }, [diff]);

  const filtered = diff
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => {
      if (!fileFilter) return true;
      const path = (file.newPath || file.oldPath).toLowerCase();
      return path.includes(fileFilter.toLowerCase());
    });

  return (
    <aside className="w-64 shrink-0 hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-8rem)] flex flex-col border border-border rounded-lg bg-surface overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-surface-secondary text-xs font-medium text-text-secondary">
          {diff.length} files changed
        </div>
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
            placeholder="Filter files..."
            className="w-full px-2 py-1.5 border border-border rounded text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">
              No files match filter
            </div>
          )}
          {filtered.map(({ file, idx }) => {
            const path = file.newPath || file.oldPath;
            const counts = threadCounts.get(path);
            const stats = statsByIdx.get(idx);
            return (
              <button
                key={idx}
                ref={idx === activeFileIdx ? activeRef : undefined}
                onClick={() => scrollToFile(idx)}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate flex items-center gap-1.5 border-b border-border/50 ${
                  idx === activeFileIdx
                    ? "bg-selected-bg text-selected-text"
                    : "hover:bg-surface-secondary text-text-primary"
                }`}
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                    file.status === "added"
                      ? "bg-success"
                      : file.status === "deleted"
                        ? "bg-danger"
                        : "bg-warning"
                  }`}
                />
                <span className="truncate flex-1">{path}</span>
                {stats && (stats.added > 0 || stats.removed > 0) && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium">
                    {stats.added > 0 && <span className="text-success">+{stats.added}</span>}
                    {stats.removed > 0 && <span className="text-danger">−{stats.removed}</span>}
                  </span>
                )}
                {counts && counts.total > 0 && (
                  <span
                    className={`shrink-0 text-[10px] px-1 rounded ${
                      counts.unresolved > 0
                        ? "bg-warning/20 text-warning"
                        : "bg-success/20 text-success"
                    }`}
                    title={`${counts.unresolved} unresolved / ${counts.total} total`}
                  >
                    {counts.unresolved > 0 ? `${counts.unresolved}` : `${counts.total}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// PullFilesView — main export.
// ---------------------------------------------------------------------------

export function PullFilesView({
  owner,
  repo,
  prNumber,
  diff,
  sourceHeadOid,
  initialDiffComments,
  onDiffCommentsChange,
  currentUser,
}: {
  owner: string;
  repo: string;
  prNumber: string;
  diff: DiffFile[] | null;
  sourceHeadOid: string | null;
  initialDiffComments: DiffComment[];
  onDiffCommentsChange?: (next: DiffComment[]) => void;
  currentUser: { username: string } | null;
}) {
  const [fileFilter, setFileFilter] = useState("");
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [comments, setComments] = useState<DiffComment[]>(initialDiffComments);
  const [newCommentTarget, setNewCommentTarget] = useState<{ lineKey: string } | null>(null);
  const [newCommentSubmitting, setNewCommentSubmitting] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const fileElRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Sync upstream when comments change.
  useEffect(() => {
    onDiffCommentsChange?.(comments);
  }, [comments, onDiffCommentsChange]);

  // Build per-file, per-line thread index from the flat comment list.
  const { threadsByFileLine, threadCountsByFile } = useMemo(() => {
    // Group all comments by their (filePath, side, lineNumber) line key.
    // For replies (parentId != null), they sit under their parent's thread.
    const rootById = new Map<string, DiffComment>();
    for (const c of comments) if (!c.parentId) rootById.set(c.id, c);

    const repliesByParent = new Map<string, DiffComment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const arr = repliesByParent.get(c.parentId) || [];
        arr.push(c);
        repliesByParent.set(c.parentId, arr);
      }
    }

    const threadsByFileLine = new Map<
      string,
      Array<{ root: DiffComment; replies: DiffComment[] }>
    >();
    const threadCountsByFile = new Map<string, { total: number; unresolved: number }>();

    for (const root of rootById.values()) {
      const key = lineKey(root.filePath, root.side, root.lineNumber);
      const replies = (repliesByParent.get(root.id) || []).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      );
      const arr = threadsByFileLine.get(key) || [];
      arr.push({ root, replies });
      threadsByFileLine.set(key, arr);

      const counts = threadCountsByFile.get(root.filePath) || { total: 0, unresolved: 0 };
      counts.total += 1;
      if (!root.resolved) counts.unresolved += 1;
      threadCountsByFile.set(root.filePath, counts);
    }

    return { threadsByFileLine, threadCountsByFile };
  }, [comments]);

  // Sentinel-based batch loading.
  useEffect(() => {
    if (!diff || renderedCount >= diff.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRenderedCount((prev) => Math.min(prev + BATCH_SIZE, diff.length));
        }
      },
      { rootMargin: "300px 0px" },
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [diff, renderedCount]);

  // Active file tracking.
  useEffect(() => {
    if (!diff || diff.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-file-idx"));
            if (!isNaN(idx)) setActiveFileIdx(idx);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px", threshold: 0 },
    );

    fileElRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [diff, renderedCount]);

  const storeRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) fileElRefs.current.set(idx, el);
    else fileElRefs.current.delete(idx);
  }, []);

  const scrollToFile = useCallback((idx: number) => {
    setRenderedCount((prev) => Math.max(prev, idx + 1));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = fileElRefs.current.get(idx);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  // ---- mutation handlers ----------------------------------------------------

  // Pre-render markdown via the server preview action (consistent sanitization).
  async function renderBody(body: string): Promise<string> {
    try {
      const r = await previewMarkdown(body);
      return r.html;
    } catch {
      return "";
    }
  }

  const handleSubmitNewComment = useCallback(
    async (filePath: string, side: "old" | "new", lineNumber: number, body: string) => {
      if (!currentUser || !sourceHeadOid) return;
      setNewCommentSubmitting(true);
      try {
        const result = await createDiffComment({
          owner,
          repo,
          prNumber: Number(prNumber),
          filePath,
          commitOid: sourceHeadOid,
          side,
          lineNumber,
          body,
        });
        if ("error" in result || !result.comment) {
          alert(result.error || "Failed to add comment");
          return;
        }
        const html = await renderBody(result.comment.body);
        setComments((prev) => [...prev, { ...result.comment, bodyHtml: html }]);
        setNewCommentTarget(null);
      } finally {
        setNewCommentSubmitting(false);
      }
    },
    [currentUser, sourceHeadOid, owner, repo, prNumber],
  );

  const handleCreateReply = useCallback(
    async (parentId: string, body: string) => {
      const parent = comments.find((c) => c.id === parentId);
      if (!parent || !currentUser || !sourceHeadOid) return;
      const result = await createDiffComment({
        owner,
        repo,
        prNumber: Number(prNumber),
        filePath: parent.filePath,
        commitOid: parent.commitOid,
        side: parent.side,
        lineNumber: parent.lineNumber,
        body,
        parentId,
      });
      if ("error" in result || !result.comment) {
        alert(result.error || "Failed to reply");
        return;
      }
      const html = await renderBody(result.comment.body);
      setComments((prev) => [...prev, { ...result.comment, bodyHtml: html }]);
    },
    [comments, currentUser, sourceHeadOid, owner, repo, prNumber],
  );

  const handleEdit = useCallback(
    async (id: string, body: string) => {
      const result = await updateDiffComment(owner, repo, Number(prNumber), id, body);
      if ("error" in result || !result.comment) {
        alert(result.error || "Failed to update comment");
        return;
      }
      const html = await renderBody(body);
      setComments((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, body, bodyHtml: html, updatedAt: new Date().toISOString() } : c,
        ),
      );
    },
    [owner, repo, prNumber],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteDiffComment(owner, repo, Number(prNumber), id);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      // Remove the deleted comment + any replies pointing at it.
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    },
    [owner, repo, prNumber],
  );

  const handleResolveToggle = useCallback(
    async (id: string, resolved: boolean) => {
      const result = await resolveDiffComment(owner, repo, Number(prNumber), id, resolved);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      // Apply locally to root + replies.
      setComments((prev) => {
        const root = prev.find((c) => c.id === id);
        if (!root) return prev;
        const rootId = root.parentId ?? root.id;
        return prev.map((c) => (c.id === rootId || c.parentId === rootId ? { ...c, resolved } : c));
      });
    },
    [owner, repo, prNumber],
  );

  if (!diff) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
        No diff available.
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <DiffSidebar
        diff={diff}
        fileFilter={fileFilter}
        setFileFilter={setFileFilter}
        scrollToFile={scrollToFile}
        activeFileIdx={activeFileIdx}
        threadCounts={threadCountsByFile}
      />

      {/* Mobile collapsible — under lg the sticky sidebar hides; this <details>
          gives the same file list on tap. Native <details> avoids needing a
          new client state machine for "is dropdown open". */}
      <details className="lg:hidden border border-border rounded-lg bg-surface group">
        <summary className="px-3 py-2 text-sm font-medium text-text-primary cursor-pointer flex items-center justify-between">
          <span>Files in this PR ({diff.length})</span>
          <svg
            className="w-4 h-4 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="border-t border-border max-h-72 overflow-y-auto">
          {diff.map((file, idx) => {
            const path = file.newPath || file.oldPath;
            return (
              <button
                key={idx}
                onClick={() => scrollToFile(idx)}
                className="w-full text-left px-3 py-1.5 text-xs font-mono truncate flex items-center gap-1.5 border-b border-border/50 hover:bg-surface-secondary text-text-primary"
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                    file.status === "added"
                      ? "bg-success"
                      : file.status === "deleted"
                        ? "bg-danger"
                        : "bg-warning"
                  }`}
                />
                <span className="truncate flex-1">{path}</span>
              </button>
            );
          })}
        </div>
      </details>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {diff.slice(0, renderedCount).map((file, fileIdx) => {
          const path = file.newPath || file.oldPath;
          // Filter the threads-by-line map down to just this file for memoization.
          // We pass the whole map since it's a Map (reference-stable per
          // comments edit) — DiffFileCard will look up via lineKey.
          return (
            <div
              key={fileIdx}
              ref={(el) => storeRef(fileIdx, el)}
              data-file-idx={fileIdx}
              className="scroll-mt-24"
            >
              <DiffFileCard
                file={file}
                filePath={path}
                threadsByLineKey={threadsByFileLine}
                currentUser={currentUser}
                ownerName={owner}
                newCommentTarget={newCommentTarget}
                setNewCommentTarget={setNewCommentTarget}
                newCommentSubmitting={newCommentSubmitting}
                onSubmitNewComment={(side, line, body) =>
                  handleSubmitNewComment(path, side, line, body)
                }
                onCreateReply={handleCreateReply}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onResolveToggle={handleResolveToggle}
              />
            </div>
          );
        })}

        {renderedCount < diff.length && (
          <div ref={sentinelRef} className="py-3 flex items-center justify-center">
            <span className="text-xs text-text-secondary">
              Loading more files... ({renderedCount} of {diff.length})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
