"use server";

import { db, editHistory, users, issues, pullRequests, repositories } from "@groffee/db";
import { eq, desc, inArray, sql } from "drizzle-orm";

export async function getEditHistory(
  targetType: "issue" | "pull_request" | "comment",
  targetId: string,
) {
  const condition =
    targetType === "issue"
      ? eq(editHistory.issueId, targetId)
      : targetType === "pull_request"
        ? eq(editHistory.pullRequestId, targetId)
        : eq(editHistory.commentId, targetId);

  const edits = await db
    .select()
    .from(editHistory)
    .where(condition)
    .orderBy(desc(editHistory.createdAt));

  if (edits.length === 0) return [];

  // Attach editor usernames
  const editorIds = [...new Set(edits.map((e) => e.editedById))];
  const editors = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, editorIds));
  const editorMap = new Map(editors.map((u) => [u.id, u.username]));

  return edits.map((e) => ({
    id: e.id,
    previousTitle: e.previousTitle,
    previousBody: e.previousBody,
    editedBy: editorMap.get(e.editedById) || "unknown",
    createdAt: e.createdAt?.toISOString() || null,
  }));
}

export async function searchIssues(query: string, limit: number = 20, offset: number = 0) {
  if (!query.trim()) return { results: [], total: 0 };

  try {
    const results = db.all(
      sql`SELECT is2.issue_id, snippet(issue_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(issue_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM issue_search is2 WHERE issue_search MATCH ${query.trim()} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    ) as Array<{ issue_id: string; title_snippet: string; body_snippet: string }>;

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM issue_search WHERE issue_search MATCH ${query.trim()}`,
    ) as [{ total: number }];

    if (results.length === 0) return { results: [], total };

    const issueIds = results.map((r) => r.issue_id);
    const issueRows = await db
      .select({
        id: issues.id,
        number: issues.number,
        title: issues.title,
        status: issues.status,
        repoId: issues.repoId,
        authorId: issues.authorId,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .where(inArray(issues.id, issueIds));

    const repoIds = [...new Set(issueRows.map((i) => i.repoId))];
    const repos = await db
      .select({
        id: repositories.id,
        name: repositories.name,
        ownerId: repositories.ownerId,
        isPublic: repositories.isPublic,
      })
      .from(repositories)
      .where(inArray(repositories.id, repoIds));
    const repoMap = new Map(repos.map((r) => [r.id, r]));

    const ownerIds = [...new Set(repos.map((r) => r.ownerId))];
    const owners = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, ownerIds));
    const ownerMap = new Map(owners.map((u) => [u.id, u.username]));

    const issueMap = new Map(issueRows.map((i) => [i.id, i]));

    const items = results
      .map((r) => {
        const issue = issueMap.get(r.issue_id);
        if (!issue) return null;
        const repo = repoMap.get(issue.repoId);
        if (!repo || !repo.isPublic) return null;
        return {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: issue.status,
          titleSnippet: r.title_snippet,
          bodySnippet: r.body_snippet,
          repoName: repo.name,
          repoOwner: ownerMap.get(repo.ownerId) || "unknown",
          createdAt: issue.createdAt?.toISOString() || null,
        };
      })
      .filter(Boolean);

    return { results: items, total };
  } catch {
    return { results: [], total: 0 };
  }
}

export async function searchPullRequests(query: string, limit: number = 20, offset: number = 0) {
  if (!query.trim()) return { results: [], total: 0 };

  try {
    const results = db.all(
      sql`SELECT ps.pr_id, snippet(pr_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(pr_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM pr_search ps WHERE pr_search MATCH ${query.trim()} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    ) as Array<{ pr_id: string; title_snippet: string; body_snippet: string }>;

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM pr_search WHERE pr_search MATCH ${query.trim()}`,
    ) as [{ total: number }];

    if (results.length === 0) return { results: [], total };

    const prIds = results.map((r) => r.pr_id);
    const prRows = await db
      .select({
        id: pullRequests.id,
        number: pullRequests.number,
        title: pullRequests.title,
        status: pullRequests.status,
        repoId: pullRequests.repoId,
        authorId: pullRequests.authorId,
        sourceBranch: pullRequests.sourceBranch,
        targetBranch: pullRequests.targetBranch,
        createdAt: pullRequests.createdAt,
      })
      .from(pullRequests)
      .where(inArray(pullRequests.id, prIds));

    const repoIds = [...new Set(prRows.map((p) => p.repoId))];
    const repos = await db
      .select({
        id: repositories.id,
        name: repositories.name,
        ownerId: repositories.ownerId,
        isPublic: repositories.isPublic,
      })
      .from(repositories)
      .where(inArray(repositories.id, repoIds));
    const repoMap = new Map(repos.map((r) => [r.id, r]));

    const ownerIds = [...new Set(repos.map((r) => r.ownerId))];
    const owners = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, ownerIds));
    const ownerMap = new Map(owners.map((u) => [u.id, u.username]));

    const prMap = new Map(prRows.map((p) => [p.id, p]));

    const items = results
      .map((r) => {
        const pr = prMap.get(r.pr_id);
        if (!pr) return null;
        const repo = repoMap.get(pr.repoId);
        if (!repo || !repo.isPublic) return null;
        return {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          status: pr.status,
          titleSnippet: r.title_snippet,
          bodySnippet: r.body_snippet,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          repoName: repo.name,
          repoOwner: ownerMap.get(repo.ownerId) || "unknown",
          createdAt: pr.createdAt?.toISOString() || null,
        };
      })
      .filter(Boolean);

    return { results: items, total };
  } catch {
    return { results: [], total: 0 };
  }
}
