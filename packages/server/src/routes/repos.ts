import { Hono } from "hono";
import { db, repositories, users } from "@groffee/db";
import { eq, and, like, desc } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { initBareRepo, getTree, getBlob, getCommitLog, getCommit, listRefs } from "@groffee/git";
import { getDiff } from "@groffee/git";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = process.env.DATA_DIR || path.resolve(PROJECT_ROOT, "data", "repositories");

export const repoRoutes = new Hono();

// List/search all public repositories (for explore page)
repoRoutes.get("/", async (c) => {
  const q = c.req.query("q")?.trim();
  const limit = Math.min(parseInt(c.req.query("limit") || "30", 10), 100);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let repos;
  if (q) {
    repos = await db
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
      .where(and(eq(repositories.isPublic, true), like(repositories.name, `%${q}%`)))
      .orderBy(desc(repositories.updatedAt))
      .limit(limit)
      .offset(offset);
  } else {
    repos = await db
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
      .where(eq(repositories.isPublic, true))
      .orderBy(desc(repositories.updatedAt))
      .limit(limit)
      .offset(offset);
  }

  // Attach owner usernames
  const ownerIds = [...new Set(repos.map((r) => r.ownerId))];
  const owners = ownerIds.length > 0
    ? await Promise.all(
        ownerIds.map(async (id) => {
          const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
          return u;
        }),
      )
    : [];
  const ownerMap = new Map(owners.filter(Boolean).map((u) => [u.id, u.username]));

  const result = repos.map((r) => ({
    ...r,
    owner: ownerMap.get(r.ownerId) || "unknown",
  }));

  return c.json({ repositories: result });
});

// Create repository
repoRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const { name, description, isPublic = true } = await c.req.json();

  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return c.json(
      { error: "Invalid repository name. Use alphanumeric characters, dots, hyphens, and underscores." },
      400,
    );
  }

  // Check if repo already exists for this user
  const [existing] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, user.id), eq(repositories.name, name)))
    .limit(1);

  if (existing) {
    return c.json({ error: "Repository already exists" }, 409);
  }

  const diskPath = path.resolve(DATA_DIR, user.username, `${name}.git`);
  await initBareRepo(diskPath);

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(repositories).values({
    id,
    ownerId: user.id,
    name,
    description: description || null,
    isPublic,
    diskPath,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    repository: { id, name, description, isPublic, owner: user.username },
  });
});

// List repositories for a user
repoRoutes.get("/:owner", optionalAuth, async (c) => {
  const ownerName = c.req.param("owner");

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);

  if (!owner) return c.json({ error: "User not found" }, 404);

  const currentUser = c.get("user") as { id: string } | undefined;
  const isOwner = currentUser?.id === owner.id;

  const repos = isOwner
    ? await db.select().from(repositories).where(eq(repositories.ownerId, owner.id))
    : await db
        .select()
        .from(repositories)
        .where(
          and(eq(repositories.ownerId, owner.id), eq(repositories.isPublic, true)),
        );

  return c.json({ repositories: repos });
});

// Get single repository
repoRoutes.get("/:owner/:name", optionalAuth, async (c) => {
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("name");

  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);

  if (!owner) return c.json({ error: "User not found" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const currentUser = c.get("user") as { id: string } | undefined;
  if (!repo.isPublic && currentUser?.id !== owner.id) {
    return c.json({ error: "Repository not found" }, 404);
  }

  return c.json({ repository: { ...repo, owner: ownerName } });
});

// Update repository settings (owner only)
repoRoutes.patch("/:owner/:name", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("name");

  if (user.username !== ownerName) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, user.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.description === "string") updates.description = body.description || null;
  if (typeof body.isPublic === "boolean") updates.isPublic = body.isPublic;
  if (typeof body.defaultBranch === "string" && body.defaultBranch) updates.defaultBranch = body.defaultBranch;

  await db.update(repositories).set(updates).where(eq(repositories.id, repo.id));

  const [updated] = await db.select().from(repositories).where(eq(repositories.id, repo.id)).limit(1);
  return c.json({ repository: { ...updated, owner: ownerName } });
});

// Delete repository (owner only)
repoRoutes.delete("/:owner/:name", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("name");

  if (user.username !== ownerName) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, user.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return c.json({ error: "Repository not found" }, 404);

  // Delete from DB (cascades to issues, PRs, comments)
  await db.delete(repositories).where(eq(repositories.id, repo.id));

  // Delete bare git repo from disk
  const { rm } = await import("node:fs/promises");
  try {
    await rm(repo.diskPath, { recursive: true, force: true });
  } catch {
    // Best effort — DB record is already gone
  }

  return c.json({ deleted: true });
});

// Helper: resolve repo from owner/name params, respecting visibility
async function findRepo(ownerName: string, repoName: string, currentUserId?: string) {
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);

  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return null;

  // Private repos only visible to their owner
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return repo;
}

// Get refs (branches + tags)
repoRoutes.get("/:owner/:name/refs", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  try {
    const refs = await listRefs(repo.diskPath);
    return c.json({ refs, defaultBranch: repo.defaultBranch });
  } catch {
    return c.json({ refs: [], defaultBranch: repo.defaultBranch });
  }
});

// Get tree at ref + path
repoRoutes.get("/:owner/:name/tree/:ref{.+}", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const refAndPath = c.req.param("ref");
  // The ref could be "main" or "main/src/lib" — we need to split ref from path
  // Try the full string as a ref first, then progressively strip path segments
  const refs = await listRefs(repo.diskPath);
  const refNames = refs.map((r) => r.name);

  let ref = repo.defaultBranch;
  let treePath = "";

  // Find the longest matching ref
  const parts = refAndPath.split("/");
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join("/");
    if (refNames.includes(candidate)) {
      ref = candidate;
      treePath = parts.slice(i).join("/");
      break;
    }
  }

  // If no ref matched, try using first segment as ref
  if (ref === repo.defaultBranch && parts.length > 0) {
    ref = parts[0];
    treePath = parts.slice(1).join("/");
  }

  try {
    const entries = await getTree(repo.diskPath, ref, treePath);
    return c.json({ entries, ref, path: treePath });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read tree";
    return c.json({ error: message }, 404);
  }
});

// Get blob at ref + path
repoRoutes.get("/:owner/:name/blob/:ref{.+}", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const refAndPath = c.req.param("ref");
  const refs = await listRefs(repo.diskPath);
  const refNames = refs.map((r) => r.name);

  let ref = repo.defaultBranch;
  let filePath = refAndPath;

  const parts = refAndPath.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = parts.slice(0, i).join("/");
    if (refNames.includes(candidate)) {
      ref = candidate;
      filePath = parts.slice(i).join("/");
      break;
    }
  }

  if (ref === repo.defaultBranch && parts.length > 1) {
    ref = parts[0];
    filePath = parts.slice(1).join("/");
  }

  try {
    const { content, oid } = await getBlob(repo.diskPath, ref, filePath);
    const text = new TextDecoder().decode(content);
    return c.json({ content: text, oid, ref, path: filePath });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read file";
    return c.json({ error: message }, 404);
  }
});

// Get commit log
repoRoutes.get("/:owner/:name/commits/:ref", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const ref = c.req.param("ref");
  const limit = parseInt(c.req.query("limit") || "30", 10);

  try {
    const commits = await getCommitLog(repo.diskPath, ref, limit);
    return c.json({ commits, ref });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read commits";
    return c.json({ error: message }, 404);
  }
});

// Get single commit with diff
repoRoutes.get("/:owner/:name/commit/:sha", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const sha = c.req.param("sha");

  try {
    const commit = await getCommit(repo.diskPath, sha);
    let diff = null;
    if (commit.parents.length > 0) {
      diff = await getDiff(repo.diskPath, commit.parents[0], sha);
    }
    return c.json({ commit, diff });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read commit";
    return c.json({ error: message }, 404);
  }
});
