"use server";

import { db, repositories, users, issues, pullRequests, comments, editHistory } from "@groffee/db";
import { eq, and, desc, max, count, inArray, sql } from "drizzle-orm";
import { listRefs, getDiff } from "@groffee/git";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

const execFileAsync = promisify(execFile);

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
) {
  const currentUser = await getSessionUser();
  const result = await findRepoForPulls(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const prList = await db
    .select()
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repoId, result.repo.id),
        eq(pullRequests.status, status as "open" | "closed" | "merged"),
      ),
    )
    .orderBy(desc(pullRequests.createdAt));

  const authorIds = [...new Set(prList.map((p) => p.authorId))];
  const authors =
    authorIds.length > 0
      ? await Promise.all(
          authorIds.map(async (id) => {
            const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
            return u;
          }),
        )
      : [];
  const authorMap = new Map(authors.filter(Boolean).map((u) => [u.id, u.username]));

  const prsWithAuthors = prList.map((p) => ({
    ...p,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
    mergedAt: p.mergedAt instanceof Date ? p.mergedAt.toISOString() : p.mergedAt,
    author: authorMap.get(p.authorId) || "unknown",
  }));

  return { pullRequests: prsWithAuthors };
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

  const [author] = await db.select().from(users).where(eq(users.id, pr.authorId)).limit(1);

  let diff = null;
  try {
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", pr.targetBranch, pr.sourceBranch],
      { cwd: result.repo.diskPath },
    );
    diff = await getDiff(result.repo.diskPath, mergeBase.trim(), pr.sourceBranch);
  } catch {
    // Branches may not exist anymore
  }

  const commentList = await db
    .select()
    .from(comments)
    .where(eq(comments.pullRequestId, pr.id))
    .orderBy(comments.createdAt);

  const commentAuthorIds = [...new Set(commentList.map((c) => c.authorId))];
  const commentAuthors =
    commentAuthorIds.length > 0
      ? await Promise.all(
          commentAuthorIds.map(async (id) => {
            const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
            return u;
          }),
        )
      : [];
  const commentAuthorMap = new Map(commentAuthors.filter(Boolean).map((u) => [u.id, u.username]));

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
        lastEditedAt: e.lastEditedAt instanceof Date ? e.lastEditedAt.toISOString() : e.lastEditedAt ?? null,
      },
    ]),
  );

  const commentsWithAuthors = commentList.map((c) => ({
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    author: commentAuthorMap.get(c.authorId) || "unknown",
    editCount: commentEditMap.get(c.id)?.editCount || 0,
    lastEditedAt: commentEditMap.get(c.id)?.lastEditedAt || null,
  }));

  let mergedBy = null;
  if (pr.mergedById) {
    const [u] = await db.select().from(users).where(eq(users.id, pr.mergedById)).limit(1);
    mergedBy = u?.username || null;
  }

  return {
    pullRequest: {
      ...pr,
      createdAt: pr.createdAt instanceof Date ? pr.createdAt.toISOString() : pr.createdAt,
      updatedAt: pr.updatedAt instanceof Date ? pr.updatedAt.toISOString() : pr.updatedAt,
      mergedAt: pr.mergedAt instanceof Date ? pr.mergedAt.toISOString() : pr.mergedAt,
      author: author?.username || "unknown",
      mergedBy,
      editCount: prEditInfo?.editCount || 0,
      lastEditedAt: prEditInfo?.lastEditedAt instanceof Date
        ? prEditInfo.lastEditedAt.toISOString()
        : typeof prEditInfo?.lastEditedAt === "string" ? prEditInfo.lastEditedAt : null,
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

  if (!data.title?.trim()) return { error: "Title is required" };
  if (!data.sourceBranch) return { error: "Source branch is required" };

  const target = data.targetBranch || result.repo.defaultBranch;

  const refs = await listRefs(result.repo.diskPath);
  const refNames = refs.map((r) => r.name);
  if (!refNames.includes(data.sourceBranch))
    return { error: `Branch '${data.sourceBranch}' not found` };
  if (!refNames.includes(target)) return { error: `Branch '${target}' not found` };
  if (data.sourceBranch === target)
    return { error: "Source and target branches must be different" };

  const [maxIssue] = await db
    .select({ maxNum: max(issues.number) })
    .from(issues)
    .where(eq(issues.repoId, result.repo.id));

  const [maxPR] = await db
    .select({ maxNum: max(pullRequests.number) })
    .from(pullRequests)
    .where(eq(pullRequests.repoId, result.repo.id));

  const nextNumber = Math.max(maxIssue?.maxNum || 0, maxPR?.maxNum || 0) + 1;

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(pullRequests).values({
    id,
    number: nextNumber,
    repoId: result.repo.id,
    title: data.title.trim(),
    body: data.body?.trim() || null,
    authorId: user.id,
    sourceBranch: data.sourceBranch,
    targetBranch: target,
    status: "open",
    createdAt: now,
    updatedAt: now,
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
    metadata: { title: data.title, sourceBranch: data.sourceBranch, targetBranch: target, repoName },
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

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };

  // Only author or repo owner can edit title/body or change status
  if (typeof updates.title === "string" || typeof updates.body === "string" || typeof updates.status === "string") {
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

  const [updated] = await db
    .select()
    .from(pullRequests)
    .where(eq(pullRequests.id, pr.id))
    .limit(1);
  return { pullRequest: updated };
}

export async function mergePullRequest(ownerName: string, repoName: string, prNumber: number) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForPulls(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };

  if (user.id !== result.owner.id) {
    return { error: "Only the repository owner can merge pull requests" };
  }

  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, prNumber)))
    .limit(1);

  if (!pr) return { error: "Pull request not found" };
  if (pr.status !== "open") return { error: "Pull request is not open" };

  try {
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", pr.targetBranch, pr.sourceBranch],
      { cwd: result.repo.diskPath },
    );

    const { stdout: targetTip } = await execFileAsync("git", ["rev-parse", pr.targetBranch], {
      cwd: result.repo.diskPath,
    });

    if (mergeBase.trim() === targetTip.trim()) {
      const { stdout: sourceTip } = await execFileAsync("git", ["rev-parse", pr.sourceBranch], {
        cwd: result.repo.diskPath,
      });
      await execFileAsync(
        "git",
        ["update-ref", `refs/heads/${pr.targetBranch}`, sourceTip.trim()],
        { cwd: result.repo.diskPath },
      );
    } else {
      const { stdout: treeOid } = await execFileAsync(
        "git",
        ["merge-tree", "--write-tree", pr.targetBranch, pr.sourceBranch],
        { cwd: result.repo.diskPath },
      );

      const mergeMessage = `Merge pull request #${pr.number} from ${pr.sourceBranch}\n\n${pr.title}`;
      const { stdout: commitOid } = await execFileAsync(
        "git",
        [
          "commit-tree",
          treeOid.trim(),
          "-p",
          targetTip.trim(),
          "-p",
          pr.sourceBranch,
          "-m",
          mergeMessage,
        ],
        {
          cwd: result.repo.diskPath,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: user.username,
            GIT_AUTHOR_EMAIL: `${user.username}@groffee`,
            GIT_COMMITTER_NAME: user.username,
            GIT_COMMITTER_EMAIL: `${user.username}@groffee`,
          },
        },
      );

      await execFileAsync(
        "git",
        ["update-ref", `refs/heads/${pr.targetBranch}`, commitOid.trim()],
        { cwd: result.repo.diskPath },
      );
    }

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
        repoName,
      },
      ipAddress: req ? getClientIp(req) : "unknown",
    }).catch(console.error);

    return { merged: true };
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

  return { comment: { id, body: body.trim(), author: user.username, createdAt: now.toISOString() } };
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

  const [author] = await db.select().from(users).where(eq(users.id, comment.authorId)).limit(1);

  return {
    comment: {
      id: comment.id,
      body: trimmedBody,
      author: author?.username || "unknown",
      createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
      updatedAt: new Date().toISOString(),
    },
  };
}
