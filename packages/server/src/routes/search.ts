import { Hono } from "hono";
import { db, repositories, users } from "@groffee/db";
import { eq, and, sql } from "drizzle-orm";
import { optionalAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const searchRoutes = new Hono<AppEnv>();

// Helper: find repo + check visibility
async function findRepoForSearch(ownerName: string, repoName: string, currentUserId?: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return null;
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return repo;
}

function parsePagination(c: { req: { query: (k: string) => string | undefined } }) {
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0", 10), 0);
  return { limit, offset };
}

function parseExt(c: { req: { query: (k: string) => string | undefined } }): string | null {
  const ext = c.req.query("ext")?.trim();
  if (!ext || !/^[a-zA-Z0-9]+$/.test(ext)) return null;
  return ext.toLowerCase();
}

function extractLanguageCounts(rows: Array<{ file_path: string }>): Array<{ ext: string; count: number }> {
  const extCounts: Record<string, number> = {};
  for (const row of rows) {
    const lastDot = row.file_path.lastIndexOf(".");
    if (lastDot === -1) continue;
    const ext = row.file_path.slice(lastDot + 1).toLowerCase();
    if (ext) {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
  }
  return Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ext, count]) => ({ ext, count }));
}

// Code search within a repo
searchRoutes.get("/:owner/:repo/search/code", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepoForSearch(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const { limit, offset } = parsePagination(c);
  const ext = parseExt(c);
  const extFilter = ext ? sql` AND file_path LIKE ${"%" + "." + ext}` : sql``;

  try {
    const results = db.all(
      sql`SELECT file_path, blob_oid, snippet(code_search, 3, '<mark>', '</mark>', '...', 30) as snippet FROM code_search WHERE repo_id = ${repo.id} AND code_search MATCH ${q.trim()}${extFilter} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    );
    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM code_search WHERE repo_id = ${repo.id} AND code_search MATCH ${q.trim()}${extFilter}`,
    ) as [{ total: number }];
    return c.json({ results, total, limit, offset });
  } catch {
    return c.json({ results: [], total: 0, limit, offset });
  }
});

// Language facets within a repo
searchRoutes.get("/:owner/:repo/search/code/languages", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepoForSearch(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  try {
    const rows = db.all(
      sql`SELECT file_path FROM code_search WHERE repo_id = ${repo.id} AND code_search MATCH ${q.trim()} LIMIT 10000`,
    ) as Array<{ file_path: string }>;
    return c.json({ languages: extractLanguageCounts(rows) });
  } catch {
    return c.json({ languages: [] });
  }
});

// Global code search across all public repos
searchRoutes.get("/search/code", optionalAuth, async (c) => {
  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const { limit, offset } = parsePagination(c);
  const ext = parseExt(c);
  const extFilter = ext ? sql` AND cs.file_path LIKE ${"%" + "." + ext}` : sql``;

  try {
    const results = db.all(
      sql`SELECT cs.repo_id, cs.file_path, cs.blob_oid, snippet(code_search, 3, '<mark>', '</mark>', '...', 30) as snippet FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${q.trim()}${extFilter} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    );
    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${q.trim()}${extFilter}`,
    ) as [{ total: number }];
    return c.json({ results, total, limit, offset });
  } catch {
    return c.json({ results: [], total: 0, limit, offset });
  }
});

// Global language facets
searchRoutes.get("/search/code/languages", optionalAuth, async (c) => {
  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  try {
    const rows = db.all(
      sql`SELECT cs.file_path FROM code_search cs JOIN repositories r ON r.id = cs.repo_id WHERE r.is_public = 1 AND code_search MATCH ${q.trim()} LIMIT 10000`,
    ) as Array<{ file_path: string }>;
    return c.json({ languages: extractLanguageCounts(rows) });
  } catch {
    return c.json({ languages: [] });
  }
});

// Issue search within a repo
searchRoutes.get("/:owner/:repo/search/issues", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepoForSearch(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const { limit, offset } = parsePagination(c);

  try {
    const results = db.all(
      sql`SELECT issue_id, snippet(issue_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(issue_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM issue_search WHERE repo_id = ${repo.id} AND issue_search MATCH ${q.trim()} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    );
    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM issue_search WHERE repo_id = ${repo.id} AND issue_search MATCH ${q.trim()}`,
    ) as [{ total: number }];
    return c.json({ results, total, limit, offset });
  } catch {
    return c.json({ results: [], total: 0, limit, offset });
  }
});

// PR search within a repo
searchRoutes.get("/:owner/:repo/search/pulls", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepoForSearch(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const q = c.req.query("q");
  if (!q?.trim()) return c.json({ error: "Query parameter 'q' is required" }, 400);

  const { limit, offset } = parsePagination(c);

  try {
    const results = db.all(
      sql`SELECT pr_id, snippet(pr_search, 2, '<mark>', '</mark>', '...', 30) as title_snippet, snippet(pr_search, 3, '<mark>', '</mark>', '...', 30) as body_snippet FROM pr_search WHERE repo_id = ${repo.id} AND pr_search MATCH ${q.trim()} ORDER BY rank LIMIT ${limit} OFFSET ${offset}`,
    );
    const [{ total }] = db.all(
      sql`SELECT COUNT(*) as total FROM pr_search WHERE repo_id = ${repo.id} AND pr_search MATCH ${q.trim()}`,
    ) as [{ total: number }];
    return c.json({ results, total, limit, offset });
  } catch {
    return c.json({ results: [], total: 0, limit, offset });
  }
});
