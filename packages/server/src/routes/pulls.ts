import { Hono } from "hono";
import { db, repositories, users, pullRequests, comments, editHistory } from "@groffee/db";
import { eq, and, desc, max, count, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { listRefs, getDiff } from "@groffee/git";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppEnv } from "../types.js";

const execFileAsync = promisify(execFile);

export const pullRoutes = new Hono<AppEnv>();

// Helper: find repo + check visibility
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

// List pull requests
pullRoutes.get("/:owner/:repo/pulls", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const status = c.req.query("status") || "open";

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

  // Attach author usernames
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
    author: authorMap.get(p.authorId) || "unknown",
  }));

  return c.json({ pullRequests: prsWithAuthors });
});

// Get single PR with diff and comments
pullRoutes.get("/:owner/:repo/pulls/:number", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, num)))
    .limit(1);

  if (!pr) return c.json({ error: "Pull request not found" }, 404);

  // Get author
  const [author] = await db.select().from(users).where(eq(users.id, pr.authorId)).limit(1);

  // Get diff between target and source branch
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

  // Get comments
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

  // Get edit count for the PR
  const [prEditInfo] = await db
    .select({ editCount: count(), lastEditedAt: max(editHistory.createdAt) })
    .from(editHistory)
    .where(eq(editHistory.pullRequestId, pr.id));

  // Get edit counts for comments
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
      { editCount: e.editCount, lastEditedAt: e.lastEditedAt },
    ]),
  );

  const commentsWithAuthors = commentList.map((c) => ({
    ...c,
    author: commentAuthorMap.get(c.authorId) || "unknown",
    editCount: commentEditMap.get(c.id)?.editCount || 0,
    lastEditedAt: commentEditMap.get(c.id)?.lastEditedAt || null,
  }));

  // Get merged by user
  let mergedBy = null;
  if (pr.mergedById) {
    const [u] = await db.select().from(users).where(eq(users.id, pr.mergedById)).limit(1);
    mergedBy = u?.username || null;
  }

  return c.json({
    pullRequest: {
      ...pr,
      author: author?.username || "unknown",
      mergedBy,
      editCount: prEditInfo?.editCount || 0,
      lastEditedAt: prEditInfo?.lastEditedAt || null,
    },
    diff,
    comments: commentsWithAuthors,
  });
});

// Create pull request
pullRoutes.post("/:owner/:repo/pulls", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const { title, body, sourceBranch, targetBranch } = await c.req.json();
  if (!title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!sourceBranch) return c.json({ error: "Source branch is required" }, 400);

  const target = targetBranch || result.repo.defaultBranch;

  // Verify branches exist
  const refs = await listRefs(result.repo.diskPath);
  const refNames = refs.map((r) => r.name);
  if (!refNames.includes(sourceBranch))
    return c.json({ error: `Branch '${sourceBranch}' not found` }, 400);
  if (!refNames.includes(target)) return c.json({ error: `Branch '${target}' not found` }, 400);
  if (sourceBranch === target)
    return c.json({ error: "Source and target branches must be different" }, 400);

  // Get next number (shared with issues)
  const { issues } = await import("@groffee/db");
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
    title: title.trim(),
    body: body?.trim() || null,
    authorId: user.id,
    sourceBranch,
    targetBranch: target,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ pullRequest: { id, number: nextNumber, title, author: user.username } });
});

// Update PR (close/reopen/edit)
pullRoutes.patch("/:owner/:repo/pulls/:number", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, num)))
    .limit(1);

  if (!pr) return c.json({ error: "Pull request not found" }, 404);

  const body = await c.req.json();

  // Authorization: only author or repo owner can edit title/body
  if (typeof body.title === "string" || typeof body.body === "string") {
    if (user.id !== pr.authorId && user.id !== result.owner.id) {
      return c.json({ error: "Only the author or repo owner can edit this pull request" }, 403);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const newTitle =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
  const newBody = typeof body.body === "string" ? body.body.trim() || null : undefined;

  // Record edit history if title or body actually changed
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

  if (newTitle !== undefined) updates.title = newTitle;
  if (newBody !== undefined) updates.body = newBody;
  if (body.status === "open" || body.status === "closed") {
    updates.status = body.status;
  }

  await db.update(pullRequests).set(updates).where(eq(pullRequests.id, pr.id));

  const [updated] = await db.select().from(pullRequests).where(eq(pullRequests.id, pr.id)).limit(1);
  return c.json({ pullRequest: updated });
});

// Merge pull request
pullRoutes.post("/:owner/:repo/pulls/:number/merge", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  // Only repo owner can merge
  if (user.id !== result.owner.id) {
    return c.json({ error: "Only the repository owner can merge pull requests" }, 403);
  }

  const num = parseInt(c.req.param("number"), 10);
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, num)))
    .limit(1);

  if (!pr) return c.json({ error: "Pull request not found" }, 404);
  if (pr.status !== "open") return c.json({ error: "Pull request is not open" }, 400);

  // Perform merge in bare repo using git
  try {
    // Use a temp environment to do the merge
    // For bare repos, we update the target ref to include the source commits
    // Try fast-forward first
    const { stdout: mergeBase } = await execFileAsync(
      "git",
      ["merge-base", pr.targetBranch, pr.sourceBranch],
      { cwd: result.repo.diskPath },
    );

    const { stdout: targetTip } = await execFileAsync("git", ["rev-parse", pr.targetBranch], {
      cwd: result.repo.diskPath,
    });

    if (mergeBase.trim() === targetTip.trim()) {
      // Fast-forward: just update the target ref
      const { stdout: sourceTip } = await execFileAsync("git", ["rev-parse", pr.sourceBranch], {
        cwd: result.repo.diskPath,
      });
      await execFileAsync(
        "git",
        ["update-ref", `refs/heads/${pr.targetBranch}`, sourceTip.trim()],
        { cwd: result.repo.diskPath },
      );
    } else {
      // Create a merge commit using git merge-tree + commit-tree
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

    // Update PR status
    const now = new Date();
    await db
      .update(pullRequests)
      .set({
        status: "merged",
        mergedAt: now,
        mergedById: user.id,
        updatedAt: now,
      })
      .where(eq(pullRequests.id, pr.id));

    return c.json({ merged: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Merge failed";
    return c.json({ error: `Merge failed: ${message}` }, 500);
  }
});

// Edit a comment on a PR
pullRoutes.patch("/:owner/:repo/pulls/:number/comments/:commentId", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const commentId = c.req.param("commentId");
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);

  if (!comment) return c.json({ error: "Comment not found" }, 404);

  // Authorization: only comment author or repo owner
  if (user.id !== comment.authorId && user.id !== result.owner.id) {
    return c.json({ error: "Only the author or repo owner can edit this comment" }, 403);
  }

  const { body } = await c.req.json();
  if (!body?.trim()) return c.json({ error: "Comment body is required" }, 400);

  const trimmedBody = body.trim();

  // Save history if body actually changed
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

  // Get author username
  const [author] = await db.select().from(users).where(eq(users.id, comment.authorId)).limit(1);

  return c.json({
    comment: {
      id: comment.id,
      body: trimmedBody,
      author: author?.username || "unknown",
      createdAt: comment.createdAt,
      updatedAt: new Date(),
    },
  });
});

// Add comment to PR
pullRoutes.post("/:owner/:repo/pulls/:number/comments", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPulls(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [pr] = await db
    .select()
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, result.repo.id), eq(pullRequests.number, num)))
    .limit(1);

  if (!pr) return c.json({ error: "Pull request not found" }, 404);

  const { body } = await c.req.json();
  if (!body?.trim()) return c.json({ error: "Comment body is required" }, 400);

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

  return c.json({ comment: { id, body: body.trim(), author: user.username, createdAt: now } });
});
