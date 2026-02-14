import { Hono } from "hono";
import { db, repositories, users, issues, comments, editHistory } from "@groffee/db";
import { eq, and, desc, max, count, inArray, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const issueRoutes = new Hono<AppEnv>();

// Helper: find repo + check visibility
async function findRepoForIssues(ownerName: string, repoName: string, currentUserId?: string) {
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

// List issues for a repo
issueRoutes.get("/:owner/:repo/issues", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForIssues(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const status = c.req.query("status") || "open";

  const issueList = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.status, status as "open" | "closed")))
    .orderBy(desc(issues.createdAt));

  // Attach author usernames
  const authorIds = [...new Set(issueList.map((i) => i.authorId))];
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

  const issuesWithAuthors = issueList.map((i) => ({
    ...i,
    author: authorMap.get(i.authorId) || "unknown",
  }));

  return c.json({ issues: issuesWithAuthors });
});

// Get single issue with comments
issueRoutes.get("/:owner/:repo/issues/:number", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForIssues(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, num)))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);

  // Get author
  const [author] = await db.select().from(users).where(eq(users.id, issue.authorId)).limit(1);

  // Get comments
  const commentList = await db
    .select()
    .from(comments)
    .where(eq(comments.issueId, issue.id))
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

  // Get edit count for the issue
  const [issueEditInfo] = await db
    .select({ editCount: count(), lastEditedAt: max(editHistory.createdAt) })
    .from(editHistory)
    .where(eq(editHistory.issueId, issue.id));

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

  return c.json({
    issue: {
      ...issue,
      author: author?.username || "unknown",
      editCount: issueEditInfo?.editCount || 0,
      lastEditedAt: issueEditInfo?.lastEditedAt || null,
    },
    comments: commentsWithAuthors,
  });
});

// Create issue
issueRoutes.post("/:owner/:repo/issues", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForIssues(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const { title, body } = await c.req.json();
  if (!title?.trim()) return c.json({ error: "Title is required" }, 400);

  // Get next issue number (issues and PRs share numbering per repo)
  const [maxIssue] = await db
    .select({ maxNum: max(issues.number) })
    .from(issues)
    .where(eq(issues.repoId, result.repo.id));

  const { pullRequests } = await import("@groffee/db");
  const [maxPR] = await db
    .select({ maxNum: max(pullRequests.number) })
    .from(pullRequests)
    .where(eq(pullRequests.repoId, result.repo.id));

  const nextNumber = Math.max(maxIssue?.maxNum || 0, maxPR?.maxNum || 0) + 1;

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(issues).values({
    id,
    number: nextNumber,
    repoId: result.repo.id,
    title: title.trim(),
    body: body?.trim() || null,
    authorId: user.id,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });

  // Sync FTS5 search index
  try {
    db.run(
      sql`INSERT INTO issue_search(issue_id, repo_id, title, body) VALUES (${id}, ${result.repo.id}, ${title.trim()}, ${body?.trim() || ""})`,
    );
  } catch {
    // FTS5 sync failure is non-fatal
  }

  return c.json({ issue: { id, number: nextNumber, title, author: user.username } });
});

// Update issue (close/reopen/edit)
issueRoutes.patch("/:owner/:repo/issues/:number", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForIssues(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, num)))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);

  const body = await c.req.json();

  // Authorization: only author or repo owner can edit title/body
  if (typeof body.title === "string" || typeof body.body === "string") {
    if (user.id !== issue.authorId && user.id !== result.owner.id) {
      return c.json({ error: "Only the author or repo owner can edit this issue" }, 403);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const newTitle =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
  const newBody = typeof body.body === "string" ? body.body.trim() || null : undefined;

  // Record edit history if title or body actually changed
  if (
    (newTitle !== undefined && newTitle !== issue.title) ||
    (newBody !== undefined && newBody !== issue.body)
  ) {
    await db.insert(editHistory).values({
      id: crypto.randomUUID(),
      issueId: issue.id,
      targetType: "issue",
      previousTitle: issue.title,
      previousBody: issue.body,
      editedById: user.id,
      createdAt: new Date(),
    });
  }

  if (newTitle !== undefined) updates.title = newTitle;
  if (newBody !== undefined) updates.body = newBody;
  if (body.status === "open" || body.status === "closed") {
    updates.status = body.status;
    if (body.status === "closed") updates.closedAt = new Date();
    else updates.closedAt = null;
  }

  await db.update(issues).set(updates).where(eq(issues.id, issue.id));

  // Sync FTS5 search index if title or body changed
  if (newTitle !== undefined || newBody !== undefined) {
    try {
      db.run(sql`DELETE FROM issue_search WHERE issue_id = ${issue.id}`);
      const finalTitle = newTitle ?? issue.title;
      const finalBody = newBody ?? issue.body;
      db.run(
        sql`INSERT INTO issue_search(issue_id, repo_id, title, body) VALUES (${issue.id}, ${result.repo.id}, ${finalTitle}, ${finalBody || ""})`,
      );
    } catch {
      // FTS5 sync failure is non-fatal
    }
  }

  const [updated] = await db.select().from(issues).where(eq(issues.id, issue.id)).limit(1);
  return c.json({ issue: updated });
});

// Edit a comment on an issue
issueRoutes.patch("/:owner/:repo/issues/:number/comments/:commentId", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForIssues(c.req.param("owner"), c.req.param("repo"), user.id);
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

// Add comment to issue
issueRoutes.post("/:owner/:repo/issues/:number/comments", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForIssues(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const num = parseInt(c.req.param("number"), 10);
  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, num)))
    .limit(1);

  if (!issue) return c.json({ error: "Issue not found" }, 404);

  const { body } = await c.req.json();
  if (!body?.trim()) return c.json({ error: "Comment body is required" }, 400);

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(comments).values({
    id,
    authorId: user.id,
    body: body.trim(),
    issueId: issue.id,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ comment: { id, body: body.trim(), author: user.username, createdAt: now } });
});
