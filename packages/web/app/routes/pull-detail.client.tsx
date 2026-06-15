"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useRouter } from "react-flight-router/client";
import { StatusPill, type StatusPillState } from "@groffee/ui";
import { timeAgo } from "../lib/time";
import { getSessionUser } from "../lib/server/auth";
import { updatePullRequest } from "../lib/server/pulls";
import type { DiffComment } from "./pull-files.client";
import type { PRCommit } from "./pull-commits.client";
import {
  PullDetailProvider,
  type PR,
  type Comment,
  type DiffFile,
  type PipelineRunSummary,
} from "./pull-detail-context.client";

export type { PR, Comment, DiffFile, PipelineRunSummary };

/**
 * PR detail layout — chrome only.
 *
 * Owns the header (title, status, branches, CI badge, "edited" indicator)
 * and the tab strip. All tab content is rendered through `<Outlet />`, so
 * navigating between Conversation / Files / Commits sub-routes swaps the
 * child segment without unmounting the chrome, and without re-running the
 * parent's data fetch. State that's shared across tabs (the PR record
 * itself, the comment list, the diff comment list) lives here and is
 * exposed to children via `PullDetailProvider`.
 *
 * The previous architecture mounted ONE component for all three URLs and
 * conditionally rendered the visible tab; clicking a tab thus re-ran the
 * server fetch and flashed the whole skeleton. This nested-route version
 * eliminates that.
 */
export function PullDetailLayout({
  owner,
  repo,
  prNumber,
  initialPR,
  initialPRBodyHtml,
  initialDiff,
  initialComments,
  initialDiffComments,
  initialCommits,
  sourceHeadOid,
  pipelineRun,
}: {
  owner: string;
  repo: string;
  prNumber: string;
  initialPR: PR | null;
  initialPRBodyHtml?: string;
  initialDiff: DiffFile[] | null;
  initialComments: Comment[];
  initialDiffComments?: DiffComment[];
  initialCommits?: PRCommit[];
  sourceHeadOid?: string | null;
  pipelineRun?: PipelineRunSummary | null;
}) {
  const basePath = `/${owner}/${repo}/pull/${prNumber}`;
  const location = useLocation();
  const router = useRouter();
  const path = location.pathname;
  const tab: "conversation" | "files" | "commits" = path.endsWith("/files-changed")
    ? "files"
    : path.endsWith("/commits")
      ? "commits"
      : "conversation";

  const [pr, setPrLocal] = useState<PR | null>(initialPR);
  const [prBodyHtml, setPrBodyHtmlLocal] = useState<string>(initialPRBodyHtml || "");
  const [commentsList, setCommentsListLocal] = useState<Comment[]>(initialComments);
  const [diffCommentsList, setDiffCommentsListLocal] = useState<DiffComment[]>(
    initialDiffComments || [],
  );
  const [user, setUser] = useState<{ username: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  // Sync local optimistic state with fresh server data. When react-flight-
  // router re-runs the parent's server component (e.g. on hard refresh, or
  // after `router.refresh()`), the new `initialPR` arrives as a prop. If
  // we just read from `useState`, the chrome would stay on the OLD value
  // until the next mount. The audit caught this: edit title → nav to Files
  // → nav back → chrome reverts to the pre-edit title because the cached
  // server payload was used.
  //
  // The `JSON.stringify` shallow guard is intentional: the parent re-runs
  // produce fresh object identities even when nothing changed, and we
  // don't want to clobber an unrelated optimistic in-flight update.
  const initialPRKey = JSON.stringify(initialPR);
  const initialCommentsKey = JSON.stringify(initialComments);
  const initialDiffCommentsKey = JSON.stringify(initialDiffComments);
  useEffect(() => {
    setPrLocal(initialPR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPRKey]);
  useEffect(() => {
    setPrBodyHtmlLocal(initialPRBodyHtml || "");
  }, [initialPRBodyHtml]);
  useEffect(() => {
    setCommentsListLocal(initialComments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCommentsKey]);
  useEffect(() => {
    setDiffCommentsListLocal(initialDiffComments || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDiffCommentsKey]);

  // Wrap the setters so any optimistic update ALSO schedules a server-side
  // revalidation. The setLocal call updates the chrome immediately so the
  // user sees the change without waiting; `router.refresh()` invalidates
  // the cached RSC payload so the next nav back to this route sees the
  // mutation's persisted result instead of stale cache.
  const setPr: typeof setPrLocal = useCallback(
    (next) => {
      setPrLocal(next);
      void router.refresh();
    },
    [router],
  );
  const setPrBodyHtml: typeof setPrBodyHtmlLocal = useCallback(
    (next) => {
      setPrBodyHtmlLocal(next);
      void router.refresh();
    },
    [router],
  );
  const setCommentsList: typeof setCommentsListLocal = useCallback(
    (next) => {
      setCommentsListLocal(next);
      void router.refresh();
    },
    [router],
  );
  const setDiffCommentsList: typeof setDiffCommentsListLocal = useCallback(
    (next) => {
      setDiffCommentsListLocal(next);
      void router.refresh();
    },
    [router],
  );

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

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 ${
      active
        ? "border-accent text-text-primary"
        : "border-transparent text-text-secondary hover:text-text-primary"
    }`;

  const filesCount = initialDiff?.length ?? 0;
  const commitsCount = initialCommits?.length ?? 0;

  return (
    <PullDetailProvider
      value={{
        owner,
        repo,
        prNumber,
        pr,
        setPr,
        prBodyHtml,
        setPrBodyHtml,
        diff: initialDiff,
        commentsList,
        setCommentsList,
        diffCommentsList,
        setDiffCommentsList,
        commits: initialCommits ?? [],
        sourceHeadOid: sourceHeadOid ?? null,
        pipelineRun: pipelineRun ?? null,
        user,
      }}
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
                className="flex-1 px-3 py-2 border border-border rounded-md bg-surface text-lg font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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
            <StatusPill state={pr.status as StatusPillState} />
            <span className="text-sm text-text-secondary">
              <Link
                to={`/${pr.author}`}
                className="font-semibold text-text-primary hover:underline"
              >
                {pr.author}
              </Link>{" "}
              wants to merge
              <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                {pr.sourceBranch}
              </code>
              into
              <code className="mx-1 px-1.5 py-0.5 bg-surface-secondary rounded text-xs">
                {pr.targetBranch}
              </code>
            </span>
            {pipelineRun && (
              <Link
                to={`/${owner}/${repo}/pipelines/runs/${pipelineRun.number}`}
                className="text-xs"
                title={`Pipeline ${pipelineRun.pipelineName} #${pipelineRun.number} (${pipelineRun.status})`}
              >
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
                    pipelineRun.status === "success"
                      ? "border-success/40 text-success bg-success/10"
                      : pipelineRun.status === "failure" || pipelineRun.status === "timed_out"
                        ? "border-danger/40 text-danger bg-danger/10"
                        : pipelineRun.status === "running" || pipelineRun.status === "queued"
                          ? "border-warning/40 text-warning bg-warning/10"
                          : "border-border text-text-secondary bg-surface-secondary"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  CI {pipelineRun.status}
                </span>
              </Link>
            )}
            {(pr.editCount ?? 0) > 0 && (
              <span
                className="text-xs text-text-secondary"
                title={`Edited ${pr.editCount} time${pr.editCount! > 1 ? "s" : ""}${pr.lastEditedAt ? ` - last ${timeAgo(pr.lastEditedAt)}` : ""}`}
              >
                (edited)
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto scrollbar-thin">
          <Link to={basePath} className={tabClass(tab === "conversation")}>
            Conversation
          </Link>
          <Link to={`${basePath}/files-changed`} className={tabClass(tab === "files")}>
            Files changed {filesCount > 0 ? `(${filesCount})` : ""}
          </Link>
          <Link to={`${basePath}/commits`} className={tabClass(tab === "commits")}>
            Commits {commitsCount > 0 ? `(${commitsCount})` : ""}
          </Link>
        </div>

        {/* Tab content — rendered by the active child route via Outlet. The
         * chrome above does not re-mount when the child route changes;
         * only this slot does. */}
        <Outlet />
      </div>
    </PullDetailProvider>
  );
}
