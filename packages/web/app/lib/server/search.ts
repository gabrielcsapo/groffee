"use server";

import {
  db,
  repositories,
  users,
  issues,
  pullRequests,
  editHistory,
} from "@groffee/db";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";
import { highlightSearchSnippet } from "../highlight";

// ─── Code Search (global) ───

export async function searchCode(
  query: string,
  limit: number = 20,
  offset: number = 0,
  ext: string | null = null,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0, limit, offset };

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const safeExt =
    ext && /^[a-zA-Z0-9]+$/.test(ext) ? ext.toLowerCase() : null;
  const extFilter = safeExt
    ? sql` AND cs.file_path LIKE ${"%" + "." + safeExt}`
    : sql``;

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY last_modified DESC`
      : sort === "oldest"
        ? sql`ORDER BY last_modified ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT cs.repo_id, cs.file_path, cs.blob_oid, snippet(code_search, 3, '<mark>', '</mark>', '...', 30) as snippet, COALESCE((SELECT MAX(gc.author_timestamp) FROM git_tree_entries gte JOIN git_commits gc ON gc.tree_oid = gte.root_tree_oid AND gc.repo_id = gte.repo_id WHERE gte.entry_oid = cs.blob_oid AND gte.repo_id = cs.repo_id), 0) as last_modified FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${query.trim()}${extFilter} ${orderClause} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    );

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${query.trim()}${extFilter}`,
    ) as [{ total: number }];

    // Enrich with repo name/owner
    const repoIds = [
      ...new Set((results as Array<{ repo_id: string }>).map((r) => r.repo_id)),
    ];
    let repoMap = new Map<string, { name: string; owner: string }>();
    if (repoIds.length > 0) {
      const repos = await db
        .select({
          id: repositories.id,
          name: repositories.name,
          ownerId: repositories.ownerId,
        })
        .from(repositories)
        .where(inArray(repositories.id, repoIds));

      const ownerIds = [...new Set(repos.map((r) => r.ownerId))];
      const owners = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, ownerIds));
      const ownerMap = new Map(owners.map((u) => [u.id, u.username]));

      repoMap = new Map(
        repos.map((r) => [
          r.id,
          { name: r.name, owner: ownerMap.get(r.ownerId) || "unknown" },
        ]),
      );
    }

    const typedResults = results as Array<{
      repo_id: string;
      file_path: string;
      blob_oid: string;
      snippet: string;
      last_modified: number;
    }>;

    const enriched = await Promise.all(
      typedResults.map(async (r) => ({
        file_path: r.file_path,
        blob_oid: r.blob_oid,
        snippet: r.snippet,
        highlightedSnippet: await highlightSearchSnippet(r.snippet, r.file_path),
        repo_id: r.repo_id,
        repo_name: repoMap.get(r.repo_id)?.name || undefined,
        repo_owner: repoMap.get(r.repo_id)?.owner || undefined,
        lastModified: r.last_modified > 0 ? r.last_modified * 1000 : null,
      })),
    );

    return { results: enriched, total, limit: safeLimit, offset: safeOffset };
  } catch {
    return { results: [], total: 0, limit: safeLimit, offset: safeOffset };
  }
}

// ─── Code Language Facets (global) ───

export async function searchCodeLanguages(query: string) {
  if (!query.trim()) return { languages: [] };

  try {
    const rows = db.all(
      sql`SELECT cs.file_path FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${query.trim()} LIMIT 10000`,
    ) as Array<{ file_path: string }>;

    const extCounts: Record<string, number> = {};
    for (const row of rows) {
      const lastDot = row.file_path.lastIndexOf(".");
      if (lastDot === -1) continue;
      const ext = row.file_path.slice(lastDot + 1).toLowerCase();
      if (ext) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }
    const languages = Object.entries(extCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([ext, count]) => ({ ext, count }));

    return { languages };
  } catch {
    return { languages: [] };
  }
}

// ─── Repo Search (global) ───

export async function searchRepos(
  query: string,
  limit: number = 30,
  offset: number = 0,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { repositories: [], total: 0 };

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const pattern = `%${query.trim()}%`;

  const orderBy =
    sort === "newest"
      ? desc(repositories.createdAt)
      : sort === "oldest"
        ? asc(repositories.createdAt)
        : desc(repositories.updatedAt);

  const rows = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      description: repositories.description,
      isPublic: repositories.isPublic,
      ownerId: repositories.ownerId,
      updatedAt: repositories.updatedAt,
      createdAt: repositories.createdAt,
    })
    .from(repositories)
    .where(
      sql`${repositories.isPublic} = 1 AND (${repositories.name} LIKE ${pattern} OR ${repositories.description} LIKE ${pattern})`,
    )
    .orderBy(orderBy)
    .limit(safeLimit)
    .offset(safeOffset);

  const [{ total }] = db.all(
    sql`SELECT COUNT(*) as total FROM repositories WHERE is_public = 1 AND (name LIKE ${pattern} OR description LIKE ${pattern})`,
  ) as [{ total: number }];

  const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
  let ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const owners = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, ownerIds));
    ownerMap = new Map(owners.map((u) => [u.id, u.username]));
  }

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isPublic: r.isPublic,
    owner: ownerMap.get(r.ownerId) || "unknown",
    updatedAt: r.updatedAt?.toISOString() || new Date().toISOString(),
    createdAt: r.createdAt?.toISOString() || new Date().toISOString(),
  }));

  return { repositories: result, total };
}

// ─── Issue Search (global) ───

export async function searchIssues(
  query: string,
  limit: number = 20,
  offset: number = 0,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0 };

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY i.created_at DESC`
      : sort === "oldest"
        ? sql`ORDER BY i.created_at ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT is2.issue_id, snippet(issue_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(issue_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM issue_search is2 JOIN issues i ON i.id = is2.issue_id WHERE issue_search MATCH ${query.trim()} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
    ) as Array<{
      issue_id: string;
      title_snippet: string;
      body_snippet: string;
    }>;

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

// ─── Pull Request Search (global) ───

export async function searchPullRequests(
  query: string,
  limit: number = 20,
  offset: number = 0,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0 };

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY pr.created_at DESC`
      : sort === "oldest"
        ? sql`ORDER BY pr.created_at ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT ps.pr_id, snippet(pr_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(pr_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM pr_search ps JOIN pull_requests pr ON pr.id = ps.pr_id WHERE pr_search MATCH ${query.trim()} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
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

// ─── Repo-scoped Code Search ───

export async function searchRepoCode(
  ownerName: string,
  repoName: string,
  query: string,
  limit: number = 20,
  offset: number = 0,
  ext: string | null = null,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0, limit, offset };

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  // Resolve repo ID
  const repo = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(users, eq(users.id, repositories.ownerId))
    .where(
      sql`${users.username} = ${ownerName} AND ${repositories.name} = ${repoName}`,
    )
    .then((rows) => rows[0]);

  if (!repo) return { results: [], total: 0, limit: safeLimit, offset: safeOffset };

  const safeExt =
    ext && /^[a-zA-Z0-9]+$/.test(ext) ? ext.toLowerCase() : null;
  const extFilter = safeExt
    ? sql` AND cs.file_path LIKE ${"%" + "." + safeExt}`
    : sql``;

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY last_modified DESC`
      : sort === "oldest"
        ? sql`ORDER BY last_modified ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT cs.file_path, cs.blob_oid, snippet(code_search, 3, '<mark>', '</mark>', '...', 30) as snippet, COALESCE((SELECT MAX(gc.author_timestamp) FROM git_tree_entries gte JOIN git_commits gc ON gc.tree_oid = gte.root_tree_oid AND gc.repo_id = gte.repo_id WHERE gte.entry_oid = cs.blob_oid AND gte.repo_id = cs.repo_id), 0) as last_modified FROM code_search cs WHERE cs.repo_id = ${repo.id} AND code_search MATCH ${query.trim()}${extFilter} ${orderClause} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    );

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM code_search cs WHERE cs.repo_id = ${repo.id} AND code_search MATCH ${query.trim()}${extFilter}`,
    ) as [{ total: number }];

    const typedResults = results as Array<{ file_path: string; blob_oid: string; snippet: string; last_modified: number }>;
    const highlighted = await Promise.all(
      typedResults.map(async (r) => ({
        file_path: r.file_path,
        blob_oid: r.blob_oid,
        snippet: r.snippet,
        highlightedSnippet: await highlightSearchSnippet(r.snippet, r.file_path),
        lastModified: r.last_modified > 0 ? r.last_modified * 1000 : null,
      })),
    );

    return {
      results: highlighted,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch {
    return { results: [], total: 0, limit: safeLimit, offset: safeOffset };
  }
}

// ─── Repo-scoped Code Language Facets ───

export async function searchRepoCodeLanguages(
  ownerName: string,
  repoName: string,
  query: string,
) {
  if (!query.trim()) return { languages: [] };

  const repo = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(users, eq(users.id, repositories.ownerId))
    .where(
      sql`${users.username} = ${ownerName} AND ${repositories.name} = ${repoName}`,
    )
    .then((rows) => rows[0]);

  if (!repo) return { languages: [] };

  try {
    const rows = db.all(
      sql`SELECT cs.file_path FROM code_search cs WHERE cs.repo_id = ${repo.id} AND code_search MATCH ${query.trim()} LIMIT 10000`,
    ) as Array<{ file_path: string }>;

    const extCounts: Record<string, number> = {};
    for (const row of rows) {
      const lastDot = row.file_path.lastIndexOf(".");
      if (lastDot === -1) continue;
      const ext = row.file_path.slice(lastDot + 1).toLowerCase();
      if (ext) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }
    const languages = Object.entries(extCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([ext, count]) => ({ ext, count }));

    return { languages };
  } catch {
    return { languages: [] };
  }
}

// ─── Repo-scoped Issue Search ───

export async function searchRepoIssues(
  ownerName: string,
  repoName: string,
  query: string,
  limit: number = 20,
  offset: number = 0,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0 };

  const repo = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(users, eq(users.id, repositories.ownerId))
    .where(
      sql`${users.username} = ${ownerName} AND ${repositories.name} = ${repoName}`,
    )
    .then((rows) => rows[0]);

  if (!repo) return { results: [], total: 0 };

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY i.created_at DESC`
      : sort === "oldest"
        ? sql`ORDER BY i.created_at ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT is2.issue_id, snippet(issue_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(issue_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM issue_search is2 JOIN issues i ON i.id = is2.issue_id WHERE i.repo_id = ${repo.id} AND issue_search MATCH ${query.trim()} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
    ) as Array<{ issue_id: string; title_snippet: string; body_snippet: string }>;

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM issue_search is2 JOIN issues i ON i.id = is2.issue_id WHERE i.repo_id = ${repo.id} AND issue_search MATCH ${query.trim()}`,
    ) as [{ total: number }];

    if (results.length === 0) return { results: [], total };

    const issueIds = results.map((r) => r.issue_id);
    const issueRows = await db
      .select({
        id: issues.id,
        number: issues.number,
        title: issues.title,
        status: issues.status,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .where(inArray(issues.id, issueIds));

    const issueMap = new Map(issueRows.map((i) => [i.id, i]));

    const items = results
      .map((r) => {
        const issue = issueMap.get(r.issue_id);
        if (!issue) return null;
        return {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: issue.status,
          titleSnippet: r.title_snippet,
          bodySnippet: r.body_snippet,
          createdAt: issue.createdAt?.toISOString() || null,
        };
      })
      .filter(Boolean);

    return { results: items, total };
  } catch {
    return { results: [], total: 0 };
  }
}

// ─── Repo-scoped Pull Request Search ───

export async function searchRepoPullRequests(
  ownerName: string,
  repoName: string,
  query: string,
  limit: number = 20,
  offset: number = 0,
  sort: "relevance" | "newest" | "oldest" = "relevance",
) {
  if (!query.trim()) return { results: [], total: 0 };

  const repo = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(users, eq(users.id, repositories.ownerId))
    .where(
      sql`${users.username} = ${ownerName} AND ${repositories.name} = ${repoName}`,
    )
    .then((rows) => rows[0]);

  if (!repo) return { results: [], total: 0 };

  const orderClause =
    sort === "newest"
      ? sql`ORDER BY pr.created_at DESC`
      : sort === "oldest"
        ? sql`ORDER BY pr.created_at ASC`
        : sql`ORDER BY rank`;

  try {
    const results = db.all(
      sql`SELECT ps.pr_id, snippet(pr_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(pr_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM pr_search ps JOIN pull_requests pr ON pr.id = ps.pr_id WHERE pr.repo_id = ${repo.id} AND pr_search MATCH ${query.trim()} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
    ) as Array<{ pr_id: string; title_snippet: string; body_snippet: string }>;

    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM pr_search ps JOIN pull_requests pr ON pr.id = ps.pr_id WHERE pr.repo_id = ${repo.id} AND pr_search MATCH ${query.trim()}`,
    ) as [{ total: number }];

    if (results.length === 0) return { results: [], total };

    const prIds = results.map((r) => r.pr_id);
    const prRows = await db
      .select({
        id: pullRequests.id,
        number: pullRequests.number,
        title: pullRequests.title,
        status: pullRequests.status,
        sourceBranch: pullRequests.sourceBranch,
        targetBranch: pullRequests.targetBranch,
        createdAt: pullRequests.createdAt,
      })
      .from(pullRequests)
      .where(inArray(pullRequests.id, prIds));

    const prMap = new Map(prRows.map((p) => [p.id, p]));

    const items = results
      .map((r) => {
        const pr = prMap.get(r.pr_id);
        if (!pr) return null;
        return {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          status: pr.status,
          titleSnippet: r.title_snippet,
          bodySnippet: r.body_snippet,
          sourceBranch: pr.sourceBranch,
          targetBranch: pr.targetBranch,
          createdAt: pr.createdAt?.toISOString() || null,
        };
      })
      .filter(Boolean);

    return { results: items, total };
  } catch {
    return { results: [], total: 0 };
  }
}

// ─── Edit History ───

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
