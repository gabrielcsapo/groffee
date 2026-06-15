"use server";

import {
  db,
  repositories,
  repoCollaborators,
  users,
  issues,
  pullRequests,
  pipelineRuns,
  comments,
  diffComments,
  editHistory,
  clampLimit,
  cursorOrderBy,
  cursorWhere,
  paginatedResult,
} from "@groffee/db";
import { eq, and, asc, max, count, inArray, isNull, sql } from "drizzle-orm";
import { listRefs, getCommitLog, getDiff, snapshotRefs } from "@groffee/git";
import { triggerIncrementalIndex } from "../../api/lib/indexer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";
import { resolveDiskPath } from "../../api/lib/paths";
import { batchLoadUsers, batchLoadUserProfiles } from "./user-utils";
import { highlightDiff } from "../highlight";
import { renderMarkdown } from "../markdown";
import { isRepoArchivedById } from "./repos";

const execFileAsync = promisify(execFile);
const ARCHIVED_ERROR = "This repository is archived and is read-only.";

async function findRepoForPulls(ownerName: string, repoName: string, currentUserId?: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return null;
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return { repo, owner };
}

export async function getPullRequests(
  ownerName: string,
  repoName: string,
  status: string = "open",
  options: { cursor?: string | null; limit?: number } = {},
) {
  const currentUser = await getSessionUser();
  const result = await findRepoForPulls(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" as string };

  const limit = clampLimit(options.limit);
  const prList = await db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repoId, result.repo.id),
        eq(pullRequests.status, status as "open" | "closed" | "merged"),
        cursorWhere(options.cursor, pullRequests.createdAt, pullRequests.id, "desc"),
      ),
    )
    .orderBy(...cursorOrderBy(pullRequests.createdAt, pullRequests.id, "desc"))
    .limit(limit + 1);

  const authorMap = await batchLoadUsers(prList.map((p) => p.authorId));

  // Aggregate per-PR comment counts in a single grouped query — cheaper than
  // hitting comments once per row.
  const prIds = prList.map((p) => p.id);
  const commentCounts =
    prIds.length > 0
      ? await db
          .select({
            pullRequestId: comments.pullRequestId,
            count: count(),
          })
          .from(comments)
          .where(inArray(comments.pullRequestId, prIds))
          .groupBy(comments.pullRequestId)
      : [];
  const commentCountMap = new Map(commentCounts.map((c) => [c.pullRequestId, c.count]));

  // Latest pipeline run per source-branch HEAD commit. We use a single query
  // over all source branches and pick the newest per ref. (`commit_oid` is
  // unknown until we resolve the branch HEAD which costs a git call — for
  // the list view we approximate by latest run on the `ref` matching the
  // source branch. Good enough for a status pill; the PR detail page does
  // the exact lookup by commit OID.)
  const sourceBranches = [...new Set(prList.map((p) => p.sourceBranch))];
  const runRows =
    sourceBranches.length > 0
      ? await db
          .select({
            ref: pipelineRuns.ref,
            status: pipelineRuns.status,
            number: pipelineRuns.number,
            createdAt: pipelineRuns.createdAt,
          })
          .from(pipelineRuns)
          .where(
            and(eq(pipelineRuns.repoId, result.repo.id), inArray(pipelineRuns.ref, sourceBranches)),
          )
          .orderBy(sql`${pipelineRuns.createdAt} DESC`)
      : [];
  const latestRunByRef = new Map<string, { status: string; number: number }>();
  for (const r of runRows) {
    if (!latestRunByRef.has(r.ref)) {
      latestRunByRef.set(r.ref, { status: r.status, number: r.number });
    }
  }

  const prsWithAuthors = prList.map((p) => {
    const run = latestRunByRef.get(p.sourceBranch) ?? null;
    return {
      ...p,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
      mergedAt: p.mergedAt instanceof Date ? p.mergedAt.toISOString() : p.mergedAt,
      author: authorMap.get(p.authorId) || "unknown",
      commentCount: commentCountMap.get(p.id) ?? 0,
      pipelineStatus: run?.status ?? null,
      pipelineRunNumber: run?.number ?? null,
    };
  });

  const page = paginatedResult(prsWithAuthors, limit, "createdAt");
  return { pullRequests: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

export async function getPullRequestCount(
  ownerName: string,
  repoName: string,
  status: string = "open",
) {
  const currentUser = await getSessionUser();
  const result = await findRepoForPulls(ownerName, repoName, currentUser?.id);
  if (!result) return 0;

  const [row] = await db
    .select({ count: count() })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repoId, result.repo.id),
        eq(pullRequests.status, status as "open" | "closed" | "merged"),
      ),
    );

  return row?.count ?? 0;
}

export async function getPullRequest(ownerName: string, repoName: string, prNumber: number) {
  const currentUser = await getSessionUser();
  const result = await findRepoForPulls(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };

  let diff = null;
  try {
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", pr.targetBranch, pr.sourceBranch],
      { cwd: resolveDiskPath(result.repo.diskPath) },
    );
    diff = await getDiff(resolveDiskPath(result.repo.diskPath), mergeBase.trim(), pr.sourceBranch);
    diff = await highlightDiff(diff);
  } catch {
    // Branches may not exist anymore
  }

  const commentList = await db
    .select()
    .from(comments)
    .where(eq(comments.pullRequestId, pr.id))
    .orderBy(comments.createdAt);

  // Batch-load all users (PR author + mergedBy + comment authors) in one query.
  // Using the richer profile loader so the client can render avatars without
  // a follow-up roundtrip per comment.
  const allUserIds = [
    pr.authorId,
    ...(pr.mergedById ? [pr.mergedById] : []),
    ...commentList.map((c) => c.authorId),
  ];
  const userMap = await batchLoadUserProfiles(allUserIds);

  const [prEditInfo] = await db
    .select({ editCount: count(), lastEditedAt: max(editHistory.createdAt) })
    .from(editHistory)
    .where(eq(editHistory.pullRequestId, pr.id));

  const commentIds = commentList.map((c) => c.id);
  const commentEditCounts =
    commentIds.length > 0
      ? await db
          .select({
            commentId: editHistory.commentId,
            editCount: count(),
            lastEditedAt: max(editHistory.createdAt),
          })
          .from(editHistory)
          .where(inArray(editHistory.commentId, commentIds))
          .groupBy(editHistory.commentId)
      : [];
  const commentEditMap = new Map(
    commentEditCounts.map((e) => [
      e.commentId,
      {
        editCount: e.editCount,
        lastEditedAt:
          e.lastEditedAt instanceof Date ? e.lastEditedAt.toISOString() : (e.lastEditedAt ?? null),
      },
    ]),
  );

  const commentsWithAuthors = commentList.map((c) => {
    const profile = userMap.get(c.authorId);
    return {
      ...c,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
      author: profile?.username || "unknown",
      authorDisplayName: profile?.displayName ?? null,
      authorAvatarUploadId: profile?.avatarUploadId ?? null,
      editCount: commentEditMap.get(c.id)?.editCount || 0,
      lastEditedAt: commentEditMap.get(c.id)?.lastEditedAt || null,
    };
  });

  const prAuthor = userMap.get(pr.authorId);
  const mergedByProfile = pr.mergedById ? (userMap.get(pr.mergedById) ?? null) : null;

  return {
    pullRequest: {
      ...pr,
      createdAt: pr.createdAt instanceof Date ? pr.createdAt.toISOString() : pr.createdAt,
      updatedAt: pr.updatedAt instanceof Date ? pr.updatedAt.toISOString() : pr.updatedAt,
      mergedAt: pr.mergedAt instanceof Date ? pr.mergedAt.toISOString() : pr.mergedAt,
      author: prAuthor?.username || "unknown",
      authorDisplayName: prAuthor?.displayName ?? null,
      authorAvatarUploadId: prAuthor?.avatarUploadId ?? null,
      mergedBy: mergedByProfile?.username ?? null,
      editCount: prEditInfo?.editCount || 0,
      lastEditedAt:
        prEditInfo?.lastEditedAt instanceof Date
          ? prEditInfo.lastEditedAt.toISOString()
          : typeof prEditInfo?.lastEditedAt === "string"
            ? prEditInfo.lastEditedAt
            : null,
    },
    diff,
    comments: commentsWithAuthors,
  };
}

export async function createPullRequest(
  ownerName: string,
  repoName: string,
  data: { title: string; body?: string; sourceBranch: string; targetBranch?: string },
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };
  if (await isRepoArchivedById(result.repo.id)) return { error: ARCHIVED_ERROR };

  if (!data.title?.trim()) return { error: "Title is required" };
  if (!data.sourceBranch) return { error: "Source branch is required" };

  const target = data.targetBranch || result.repo.defaultBranch;

  const refs = await listRefs(resolveDiskPath(result.repo.diskPath));
  const refNames = refs.map((r) => r.name);
  if (!refNames.includes(data.sourceBranch))
    return { error: `Branch '${data.sourceBranch}' not found` };
  if (!refNames.includes(target)) return { error: `Branch '${target}' not found` };
  if (data.sourceBranch === target)
    return { error: "Source and target branches must be different" };

  const now = new Date();
  const id = crypto.randomUUID();

  // Use a transaction to prevent TOCTOU race on number assignment
  const nextNumber = db.transaction((tx) => {
    const [maxIssue] = tx
      .select({ maxNum: max(issues.number) })
      .from(issues)
      .where(eq(issues.repoId, result.repo.id))
      .all();

    const [maxPR] = tx
      .select({ maxNum: max(pullRequests.number) })
      .from(pullRequests)
      .where(eq(pullRequests.repoId, result.repo.id))
      .all();

    const num = Math.max(maxIssue?.maxNum || 0, maxPR?.maxNum || 0) + 1;

    tx.insert(pullRequests)
      .values({
        id,
        number: num,
        repoId: result.repo.id,
        title: data.title.trim(),
        body: data.body?.trim() || null,
        authorId: user.id,
        sourceBranch: data.sourceBranch,
        targetBranch: target,
        status: "open",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return num;
  });

  try {
    db.run(
      sql`INSERT INTO pr_search(pr_id, repo_id, title, body) VALUES (${id}, ${result.repo.id}, ${data.title.trim()}, ${data.body?.trim() || ""})`,
    );
  } catch {
    // FTS5 sync failure is non-fatal
  }

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "pr.create",
    targetType: "pull_request",
    targetId: id,
    metadata: {
      title: data.title,
      sourceBranch: data.sourceBranch,
      targetBranch: target,
      repoName,
    },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { pullRequest: { id, number: nextNumber, title: data.title, author: user.username } };
}

export async function updatePullRequest(
  ownerName: string,
  repoName: string,
  prNumber: number,
  updates: { title?: string; body?: string; status?: "open" | "closed" },
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };
  if (await isRepoArchivedById(result.repo.id)) return { error: ARCHIVED_ERROR };

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };

  // Only author or repo owner can edit title/body or change status
  if (
    typeof updates.title === "string" ||
    typeof updates.body === "string" ||
    typeof updates.status === "string"
  ) {
    if (user.id !== pr.authorId && user.id !== result.owner.id) {
      return { error: "Only the author or repo owner can modify this pull request" };
    }
  }

  const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
  const newTitle =
    typeof updates.title === "string" && updates.title.trim() ? updates.title.trim() : undefined;
  const newBody = typeof updates.body === "string" ? updates.body.trim() || null : undefined;

  if (
    (newTitle !== undefined && newTitle !== pr.title) ||
    (newBody !== undefined && newBody !== pr.body)
  ) {
    await db.insert(editHistory).values({
      id: crypto.randomUUID(),
      pullRequestId: pr.id,
      targetType: "pull_request",
      previousTitle: pr.title,
      previousBody: pr.body,
      editedById: user.id,
      createdAt: new Date(),
    });
  }

  if (newTitle !== undefined) dbUpdates.title = newTitle;
  if (newBody !== undefined) dbUpdates.body = newBody;
  if (updates.status === "open" || updates.status === "closed") {
    dbUpdates.status = updates.status;
  }

  await db.update(pullRequests).set(dbUpdates).where(eq(pullRequests.id, pr.id));

  if (newTitle !== undefined || newBody !== undefined) {
    try {
      db.run(sql`DELETE FROM pr_search WHERE pr_id = ${pr.id}`);
      const finalTitle = newTitle ?? pr.title;
      const finalBody = newBody ?? pr.body;
      db.run(
        sql`INSERT INTO pr_search(pr_id, repo_id, title, body) VALUES (${pr.id}, ${result.repo.id}, ${finalTitle}, ${finalBody || ""})`,
      );
    } catch {
      // FTS5 sync failure is non-fatal
    }
  }

  const req = getRequest();
  logAudit({
    userId: user.id,
    action:
      updates.status === "closed"
        ? "pr.close"
        : updates.status === "open"
          ? "pr.reopen"
          : "pr.update",
    targetType: "pull_request",
    targetId: pr.id,
    metadata: { number: pr.number, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  const [updated] = await db.select().from(pullRequests).where(eq(pullRequests.id, pr.id)).limit(1);
  return { pullRequest: updated };
}

// Permission helper: returns true if the user has write/admin perms on the
// repo (owner or collaborator with write/admin). Used to gate merging and
// other privileged PR ops.
async function canWritePR(repoId: string, ownerId: string, userId: string): Promise<boolean> {
  if (userId === ownerId) return true;
  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repoId), eq(repoCollaborators.userId, userId)))
    .limit(1);
  if (!collab) return false;
  return collab.permission === "write" || collab.permission === "admin";
}

export type MergeStrategy = "merge" | "squash" | "rebase";

export interface MergeOptions {
  strategy?: MergeStrategy;
  commitMessage?: string;
  deleteBranch?: boolean;
}

export async function mergePullRequest(
  ownerName: string,
  repoName: string,
  prNumber: number,
  options: MergeOptions = {},
) {
  const strategy: MergeStrategy = options.strategy ?? "merge";

  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };
  if (await isRepoArchivedById(result.repo.id)) return { error: ARCHIVED_ERROR };

  // Write permission required (repo owner or collaborator with write/admin)
  const allowed = await canWritePR(result.repo.id, result.owner.id, user.id);
  if (!allowed) {
    return { error: "Only collaborators with write access can merge pull requests" };
  }

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };
  if (pr.status !== "open") return { error: "Pull request is not open" };

  if (strategy === "rebase") {
    return { error: "Rebase merging not yet supported", status: 501 as const };
  }
  if (strategy !== "merge" && strategy !== "squash") {
    return { error: `Unknown merge strategy: ${strategy}` };
  }

  const repoDiskPath = resolveDiskPath(result.repo.diskPath);
  // Snapshot refs before mutating so the indexer can diff afterward.
  const refsBefore = await snapshotRefs(repoDiskPath);

  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: user.username,
    GIT_AUTHOR_EMAIL: `${user.username}@groffee`,
    GIT_COMMITTER_NAME: user.username,
    GIT_COMMITTER_EMAIL: `${user.username}@groffee`,
  };

  let mergeCommitOid: string | null = null;

  try {
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", pr.targetBranch, pr.sourceBranch],
      { cwd: repoDiskPath },
    );

    const { stdout: targetTip } = await execFileAsync("git", ["rev-parse", pr.targetBranch], {
      cwd: repoDiskPath,
    });

    const { stdout: sourceTip } = await execFileAsync("git", ["rev-parse", pr.sourceBranch], {
      cwd: repoDiskPath,
    });

    const targetTipOid = targetTip.trim();
    const sourceTipOid = sourceTip.trim();
    const mergeBaseOid = mergeBase.trim();

    if (strategy === "merge") {
      if (mergeBaseOid === targetTipOid) {
        // Fast-forward: just update the ref to the source tip.
        await execFileAsync("git", ["update-ref", `refs/heads/${pr.targetBranch}`, sourceTipOid], {
          cwd: repoDiskPath,
        });
        mergeCommitOid = sourceTipOid;
      } else {
        const { stdout: treeOid } = await execFileAsync(
          "git",
          ["merge-tree", "--write-tree", pr.targetBranch, pr.sourceBranch],
          { cwd: repoDiskPath },
        );

        const mergeMessage =
          options.commitMessage?.trim() ||
          `Merge pull request #${pr.number} from ${pr.sourceBranch}\n\n${pr.title}`;
        const { stdout: commitOid } = await execFileAsync(
          "git",
          [
            "commit-tree",
            treeOid.trim(),
            "-p",
            targetTipOid,
            "-p",
            sourceTipOid,
            "-m",
            mergeMessage,
          ],
          { cwd: repoDiskPath, env: gitEnv },
        );

        const newOid = commitOid.trim();
        await execFileAsync("git", ["update-ref", `refs/heads/${pr.targetBranch}`, newOid], {
          cwd: repoDiskPath,
        });
        mergeCommitOid = newOid;
      }
    } else {
      // Squash: a single commit on top of the target with the merged tree
      // and the target tip as the only parent.
      const { stdout: treeOid } = await execFileAsync(
        "git",
        ["merge-tree", "--write-tree", pr.targetBranch, pr.sourceBranch],
        { cwd: repoDiskPath },
      );

      const squashMessage = options.commitMessage?.trim() || `${pr.title} (#${pr.number})`;
      const { stdout: commitOid } = await execFileAsync(
        "git",
        ["commit-tree", treeOid.trim(), "-p", targetTipOid, "-m", squashMessage],
        { cwd: repoDiskPath, env: gitEnv },
      );

      const newOid = commitOid.trim();
      await execFileAsync("git", ["update-ref", `refs/heads/${pr.targetBranch}`, newOid], {
        cwd: repoDiskPath,
      });
      mergeCommitOid = newOid;
    }

    // Optionally delete the source branch after merge.
    if (options.deleteBranch) {
      try {
        await execFileAsync("git", ["update-ref", "-d", `refs/heads/${pr.sourceBranch}`], {
          cwd: repoDiskPath,
        });
      } catch (err) {
        // Branch deletion failure is non-fatal — the merge still happened.
        console.error(`Failed to delete branch ${pr.sourceBranch}:`, err);
      }
    }

    // Index the merge: bumps gitRefs.updatedAt for the target branch and
    // indexes the new merge commit. Fire-and-forget; failure should not
    // fail the merge.
    triggerIncrementalIndex(result.repo.id, repoDiskPath, refsBefore).catch((err) =>
      console.error(`Post-merge indexing failed for repo ${result.repo.id}:`, err),
    );

    const now = new Date();
    await db
      .update(pullRequests)
      .set({ status: "merged", mergedAt: now, mergedById: user.id, updatedAt: now })
      .where(eq(pullRequests.id, pr.id));

    const req = getRequest();
    logAudit({
      userId: user.id,
      action: "pr.merge",
      targetType: "pull_request",
      targetId: pr.id,
      metadata: {
        number: pr.number,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        strategy,
        deleteBranch: !!options.deleteBranch,
        mergeCommitOid,
        repoName,
      },
      ipAddress: req ? getClientIp(req) : "unknown",
    }).catch(console.error);

    return { merged: true, mergeCommitOid };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Merge failed";
    return { error: `Merge failed: ${message}` };
  }
}

export async function createPRComment(
  ownerName: string,
  repoName: string,
  prNumber: number,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };
  if (await isRepoArchivedById(result.repo.id)) return { error: ARCHIVED_ERROR };

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };
  if (!body?.trim()) return { error: "Comment body is required" };

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(comments).values({
    id,
    authorId: user.id,
    body: body.trim(),
    pullRequestId: pr.id,
    createdAt: now,
    updatedAt: now,
  });

  return {
    comment: { id, body: body.trim(), author: user.username, createdAt: now.toISOString() },
  };
}

export async function updatePRComment(
  ownerName: string,
  repoName: string,
  _prNumber: number,
  commentId: string,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };
  if (await isRepoArchivedById(result.repo.id)) return { error: ARCHIVED_ERROR };

  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) return { error: "Comment not found" };

  if (user.id !== comment.authorId && user.id !== result.owner.id) {
    return { error: "Only the author or repo owner can edit this comment" };
  }

  if (!body?.trim()) return { error: "Comment body is required" };

  const trimmedBody = body.trim();

  if (trimmedBody !== comment.body) {
    await db.insert(editHistory).values({
      id: crypto.randomUUID(),
      commentId: comment.id,
      targetType: "comment",
      previousBody: comment.body,
      editedById: user.id,
      createdAt: new Date(),
    });
  }

  await db
    .update(comments)
    .set({ body: trimmedBody, updatedAt: new Date() })
    .where(eq(comments.id, comment.id));

  const authorMap = await batchLoadUsers([comment.authorId]);

  return {
    comment: {
      id: comment.id,
      body: trimmedBody,
      author: authorMap.get(comment.authorId) || "unknown",
      createdAt:
        comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
      updatedAt: new Date().toISOString(),
    },
  };
}

// =====================================================
// Inline diff comments (PR file review)
// =====================================================

export interface DiffCommentDTO {
  id: string;
  pullRequestId: string;
  parentId: string | null;
  filePath: string;
  commitOid: string;
  side: "old" | "new";
  lineNumber: number;
  body: string;
  bodyHtml: string;
  resolved: boolean;
  author: string;
  authorDisplayName: string | null;
  authorAvatarUploadId: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

function diffCommentLineKey(filePath: string, side: "old" | "new", lineNumber: number) {
  return `${filePath}:${side}:${lineNumber}`;
}

async function findPRForDiffComments(
  ownerName: string,
  repoName: string,
  prNumber: number,
  userId?: string,
) {
  const result = await findRepoForPulls(ownerName, repoName, userId);
  if (!result) return { error: "Repository not found" as const };

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);
  if (!pr) return { error: "Pull request not found" as const };
  return { pr, repo: result.repo, owner: result.owner };
}

/**
 * Fetch every diff comment on a PR. Returns:
 *  - flat: serializable list (used by the API route)
 *  - byLine: filePath → lineKey → DiffCommentDTO[] for fast O(1) lookup
 *    when rendering individual lines in the diff.
 *  - byParent: parentId → DiffCommentDTO[] for thread reply lookup.
 *
 * Loads all comments in one query — for v1 this is fine since PRs typically
 * have well under 200 inline comments. We can switch to cursor pagination
 * per-thread later if needed.
 *
 * Multi-tenancy: scoped strictly by PR id (which is unique to the repo) and
 * via the repo visibility check inside findPRForDiffComments.
 */
export async function getDiffComments(ownerName: string, repoName: string, prNumber: number) {
  const currentUser = await getSessionUser();
  const found = await findPRForDiffComments(ownerName, repoName, prNumber, currentUser?.id);
  if ("error" in found) return { error: found.error };

  const rows = await db
    .select()
    .from(diffComments)
    .where(eq(diffComments.pullRequestId, found.pr.id))
    .orderBy(asc(diffComments.createdAt));

  const authorIds = rows.map((r) => r.authorId);
  const authorMap = await batchLoadUserProfiles(authorIds);

  const flat: DiffCommentDTO[] = rows.map((r) => {
    const profile = authorMap.get(r.authorId);
    return {
      id: r.id,
      pullRequestId: r.pullRequestId,
      parentId: r.parentId ?? null,
      filePath: r.filePath,
      commitOid: r.commitOid,
      side: r.side as "old" | "new",
      lineNumber: r.lineNumber,
      body: r.body,
      bodyHtml: r.body ? renderMarkdown(r.body) : "",
      resolved: !!r.resolved,
      author: profile?.username || "unknown",
      authorDisplayName: profile?.displayName ?? null,
      authorAvatarUploadId: profile?.avatarUploadId ?? null,
      authorId: r.authorId,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    };
  });

  return { comments: flat };
}

export async function createDiffComment(args: {
  owner: string;
  repo: string;
  prNumber: number;
  filePath: string;
  commitOid: string;
  side: "old" | "new";
  lineNumber: number;
  body: string;
  parentId?: string | null;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const found = await findPRForDiffComments(args.owner, args.repo, args.prNumber, user.id);
  if ("error" in found) return { error: found.error };
  if (await isRepoArchivedById(found.repo.id)) return { error: ARCHIVED_ERROR };

  if (!args.body?.trim()) return { error: "Comment body is required" };
  if (args.side !== "old" && args.side !== "new") return { error: "Invalid side" };
  if (!Number.isInteger(args.lineNumber) || args.lineNumber < 1) {
    return { error: "Invalid line number" };
  }

  // If parentId is provided, ensure it belongs to this PR (multi-tenancy).
  if (args.parentId) {
    const [parent] = await db
      .select()
      .from(diffComments)
      .where(and(eq(diffComments.id, args.parentId), eq(diffComments.pullRequestId, found.pr.id)))
      .limit(1);
    if (!parent) return { error: "Parent comment not found" };
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(diffComments).values({
    id,
    pullRequestId: found.pr.id,
    authorId: user.id,
    parentId: args.parentId ?? null,
    filePath: args.filePath,
    commitOid: args.commitOid,
    side: args.side,
    lineNumber: args.lineNumber,
    body: args.body.trim(),
    resolved: false,
    createdAt: now,
    updatedAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "pr.diff_comment.create",
    targetType: "pull_request",
    targetId: found.pr.id,
    metadata: {
      diffCommentId: id,
      number: found.pr.number,
      filePath: args.filePath,
      lineNumber: args.lineNumber,
      side: args.side,
      parentId: args.parentId ?? null,
    },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    comment: {
      id,
      pullRequestId: found.pr.id,
      parentId: args.parentId ?? null,
      filePath: args.filePath,
      commitOid: args.commitOid,
      side: args.side,
      lineNumber: args.lineNumber,
      body: args.body.trim(),
      bodyHtml: renderMarkdown(args.body.trim()),
      resolved: false,
      author: user.username,
      authorId: user.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } as DiffCommentDTO,
  };
}

export async function updateDiffComment(
  ownerName: string,
  repoName: string,
  prNumber: number,
  commentId: string,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const found = await findPRForDiffComments(ownerName, repoName, prNumber, user.id);
  if ("error" in found) return { error: found.error };
  if (await isRepoArchivedById(found.repo.id)) return { error: ARCHIVED_ERROR };

  if (!body?.trim()) return { error: "Comment body is required" };

  const [existing] = await db
    .select()
    .from(diffComments)
    .where(and(eq(diffComments.id, commentId), eq(diffComments.pullRequestId, found.pr.id)))
    .limit(1);
  if (!existing) return { error: "Comment not found" };

  if (user.id !== existing.authorId && user.id !== found.owner.id) {
    return { error: "Only the author or repo owner can edit this comment" };
  }

  const trimmed = body.trim();
  const now = new Date();
  await db
    .update(diffComments)
    .set({ body: trimmed, updatedAt: now })
    .where(eq(diffComments.id, existing.id));

  return {
    comment: {
      id: existing.id,
      body: trimmed,
      bodyHtml: renderMarkdown(trimmed),
      updatedAt: now.toISOString(),
    },
  };
}

export async function deleteDiffComment(
  ownerName: string,
  repoName: string,
  prNumber: number,
  commentId: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const found = await findPRForDiffComments(ownerName, repoName, prNumber, user.id);
  if ("error" in found) return { error: found.error };

  const [existing] = await db
    .select()
    .from(diffComments)
    .where(and(eq(diffComments.id, commentId), eq(diffComments.pullRequestId, found.pr.id)))
    .limit(1);
  if (!existing) return { error: "Comment not found" };

  if (user.id !== existing.authorId && user.id !== found.owner.id) {
    return { error: "Only the author or repo owner can delete this comment" };
  }

  // Cascade-delete replies inside this thread (any comment with parentId === existing.id
  // OR the deleted comment itself).
  await db.delete(diffComments).where(
    and(
      eq(diffComments.pullRequestId, found.pr.id),
      // either the deleted comment itself, or any of its direct replies
      // (we don't support deeper threads in v1).
      // Drizzle: build with `or` via inArray for clarity.
      inArray(diffComments.id, [existing.id]),
    ),
  );
  // Also remove direct replies that point at the deleted comment.
  await db
    .delete(diffComments)
    .where(
      and(eq(diffComments.pullRequestId, found.pr.id), eq(diffComments.parentId, existing.id)),
    );

  return { deleted: true };
}

/**
 * Toggle the resolved flag on a comment thread. Both the top-level comment
 * and any replies share the resolved flag of the parent at render time, but
 * for storage simplicity we apply it to the targeted comment + its replies.
 *
 * Any participant with read access to the PR can resolve/unresolve a thread.
 */
export async function resolveDiffComment(
  ownerName: string,
  repoName: string,
  prNumber: number,
  commentId: string,
  resolved: boolean,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const found = await findPRForDiffComments(ownerName, repoName, prNumber, user.id);
  if ("error" in found) return { error: found.error };

  const [existing] = await db
    .select()
    .from(diffComments)
    .where(and(eq(diffComments.id, commentId), eq(diffComments.pullRequestId, found.pr.id)))
    .limit(1);
  if (!existing) return { error: "Comment not found" };

  // Resolve the root of the thread, then propagate to its replies.
  const rootId = existing.parentId ?? existing.id;
  const now = new Date();
  await db
    .update(diffComments)
    .set({ resolved, updatedAt: now })
    .where(and(eq(diffComments.id, rootId), eq(diffComments.pullRequestId, found.pr.id)));
  await db
    .update(diffComments)
    .set({ resolved, updatedAt: now })
    .where(and(eq(diffComments.parentId, rootId), eq(diffComments.pullRequestId, found.pr.id)));

  return { resolved };
}

// =====================================================
// PR commits (Commits tab)
// =====================================================

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

/**
 * Returns the commit set unique to the source branch (i.e. `git log
 * <targetBranch>..<sourceBranch>`). Used by the new Commits tab. The list
 * is bounded by `limit` for safety on huge PRs.
 */
export async function getPullRequestCommits(
  ownerName: string,
  repoName: string,
  prNumber: number,
  limit: number = 250,
) {
  const currentUser = await getSessionUser();
  const found = await findPRForDiffComments(ownerName, repoName, prNumber, currentUser?.id);
  if ("error" in found) return { error: found.error };

  const repoDiskPath = resolveDiskPath(found.repo.diskPath);
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "log",
        `--format=%H%x1f%an%x1f%ae%x1f%at%x1f%s`,
        `-${Math.max(1, Math.min(limit, 1000))}`,
        `${found.pr.targetBranch}..${found.pr.sourceBranch}`,
      ],
      { cwd: repoDiskPath, maxBuffer: 5 * 1024 * 1024 },
    );

    const rawCommits = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [oid, author, authorEmail, ts, message] = line.split("\x1f");
        return {
          oid,
          message: message ?? "",
          author: author ?? "",
          authorEmail: authorEmail ?? "",
          authorTimestamp: Number(ts) || 0,
        };
      });

    // Enrich each commit with the author's avatar (matched by email) and the
    // latest pipeline status (matched by commit OID). Both lookups are batch
    // queries — one per dimension, regardless of the number of commits.
    const oids = rawCommits.map((c) => c.oid);
    const emails = [
      ...new Set(rawCommits.map((c) => c.authorEmail).filter((e): e is string => !!e)),
    ];

    const userRows =
      emails.length > 0
        ? await db
            .select({
              email: users.email,
              username: users.username,
              avatarUploadId: users.avatarUploadId,
            })
            .from(users)
            .where(inArray(users.email, emails))
        : [];
    const userByEmail = new Map(
      userRows.map((u) => [
        u.email,
        { username: u.username, avatarUploadId: u.avatarUploadId ?? null },
      ]),
    );

    // For each commit OID, take the most recent pipeline run. Using SQL
    // GROUP-MAX would be cleaner but Drizzle's window-function support is
    // patchy across dialects — sort newest-first and pick the first hit.
    const runRows =
      oids.length > 0
        ? await db
            .select({
              commitOid: pipelineRuns.commitOid,
              status: pipelineRuns.status,
              number: pipelineRuns.number,
              createdAt: pipelineRuns.createdAt,
            })
            .from(pipelineRuns)
            .where(
              and(eq(pipelineRuns.repoId, found.repo.id), inArray(pipelineRuns.commitOid, oids)),
            )
            .orderBy(sql`${pipelineRuns.createdAt} DESC`)
        : [];
    const latestRunByOid = new Map<
      string,
      { status: PRCommit["pipelineStatus"]; number: number }
    >();
    for (const r of runRows) {
      if (!latestRunByOid.has(r.commitOid)) {
        latestRunByOid.set(r.commitOid, {
          status: r.status as PRCommit["pipelineStatus"],
          number: r.number,
        });
      }
    }

    const commits: PRCommit[] = rawCommits.map((c) => {
      const profile = userByEmail.get(c.authorEmail);
      const run = latestRunByOid.get(c.oid);
      return {
        ...c,
        authorUsername: profile?.username ?? null,
        authorAvatarUploadId: profile?.avatarUploadId ?? null,
        pipelineStatus: run?.status ?? null,
        pipelineRunNumber: run?.number ?? null,
      };
    });

    // Use isomorphic-git as a fallback / parity check is unnecessary; if
    // execFile failed we already returned. Reference getCommitLog so the
    // import is used (otherwise tsconfig "noUnusedLocals" trips up).
    void getCommitLog;

    return { commits, sourceBranch: found.pr.sourceBranch, targetBranch: found.pr.targetBranch };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load commits";
    return { error: message };
  }
}

// Re-export so the API route can re-use the same line-key format.
export { diffCommentLineKey };
// Silence unused-helper warnings for helper exports that callers may inline.
void isNull;
