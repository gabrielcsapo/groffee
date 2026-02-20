"use server";

import { db, repositories, users, issues, pullRequests, comments, editHistory } from "@groffee/db";
import { eq, and, desc, max, count, inArray, sql } from "drizzle-orm";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

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

export async function getIssues(ownerName: string, repoName: string, status: string = "open") {
  const currentUser = await getSessionUser();
  const result = await findRepoForIssues(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const issueList = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.status, status as "open" | "closed")))
    .orderBy(desc(issues.createdAt));

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
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
    closedAt: i.closedAt instanceof Date ? i.closedAt.toISOString() : i.closedAt,
    author: authorMap.get(i.authorId) || "unknown",
  }));

  return { issues: issuesWithAuthors };
}

export async function getIssue(ownerName: string, repoName: string, issueNumber: number) {
  const currentUser = await getSessionUser();
  const result = await findRepoForIssues(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, issueNumber)))
    .limit(1);

  if (!issue) return { error: "Issue not found" };

  const [author] = await db.select().from(users).where(eq(users.id, issue.authorId)).limit(1);

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

  const [issueEditInfo] = await db
    .select({ editCount: count(), lastEditedAt: max(editHistory.createdAt) })
    .from(editHistory)
    .where(eq(editHistory.issueId, issue.id));

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

  return {
    issue: {
      ...issue,
      createdAt: issue.createdAt instanceof Date ? issue.createdAt.toISOString() : issue.createdAt,
      updatedAt: issue.updatedAt instanceof Date ? issue.updatedAt.toISOString() : issue.updatedAt,
      closedAt: issue.closedAt instanceof Date ? issue.closedAt.toISOString() : issue.closedAt,
      author: author?.username || "unknown",
      editCount: issueEditInfo?.editCount || 0,
      lastEditedAt: issueEditInfo?.lastEditedAt instanceof Date
        ? issueEditInfo.lastEditedAt.toISOString()
        : typeof issueEditInfo?.lastEditedAt === "string" ? issueEditInfo.lastEditedAt : null,
    },
    comments: commentsWithAuthors,
  };
}

export async function createIssue(
  ownerName: string,
  repoName: string,
  title: string,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForIssues(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };

  if (!title?.trim()) return { error: "Title is required" };

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

  try {
    db.run(
      sql`INSERT INTO issue_search(issue_id, repo_id, title, body) VALUES (${id}, ${result.repo.id}, ${title.trim()}, ${body?.trim() || ""})`,
    );
  } catch {
    // FTS5 sync failure is non-fatal
  }

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "issue.create",
    targetType: "issue",
    targetId: id,
    metadata: { title, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { issue: { id, number: nextNumber, title, author: user.username } };
}

export async function updateIssue(
  ownerName: string,
  repoName: string,
  issueNumber: number,
  updates: { title?: string; body?: string; status?: "open" | "closed" },
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForIssues(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };

  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, issueNumber)))
    .limit(1);

  if (!issue) return { error: "Issue not found" };

  // Only author or repo owner can edit title/body or change status
  if (typeof updates.title === "string" || typeof updates.body === "string" || typeof updates.status === "string") {
    if (user.id !== issue.authorId && user.id !== result.owner.id) {
      return { error: "Only the author or repo owner can modify this issue" };
    }
  }

  const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
  const newTitle =
    typeof updates.title === "string" && updates.title.trim() ? updates.title.trim() : undefined;
  const newBody = typeof updates.body === "string" ? updates.body.trim() || null : undefined;

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

  if (newTitle !== undefined) dbUpdates.title = newTitle;
  if (newBody !== undefined) dbUpdates.body = newBody;
  if (updates.status === "open" || updates.status === "closed") {
    dbUpdates.status = updates.status;
    if (updates.status === "closed") dbUpdates.closedAt = new Date();
    else dbUpdates.closedAt = null;
  }

  await db.update(issues).set(dbUpdates).where(eq(issues.id, issue.id));

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

  const req = getRequest();
  logAudit({
    userId: user.id,
    action:
      updates.status === "closed"
        ? "issue.close"
        : updates.status === "open"
          ? "issue.reopen"
          : "issue.update",
    targetType: "issue",
    targetId: issue.id,
    metadata: { number: issue.number, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  const [updated] = await db.select().from(issues).where(eq(issues.id, issue.id)).limit(1);
  return { issue: updated };
}

export async function createIssueComment(
  ownerName: string,
  repoName: string,
  issueNumber: number,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForIssues(ownerName, repoName, user.id);
  if (!result) return { error: "Repository not found" };

  const [issue] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.repoId, result.repo.id), eq(issues.number, issueNumber)))
    .limit(1);

  if (!issue) return { error: "Issue not found" };
  if (!body?.trim()) return { error: "Comment body is required" };

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

  return { comment: { id, body: body.trim(), author: user.username, createdAt: now.toISOString() } };
}

export async function updateIssueComment(
  ownerName: string,
  repoName: string,
  _issueNumber: number,
  commentId: string,
  body: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const result = await findRepoForIssues(ownerName, repoName, user.id);
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
