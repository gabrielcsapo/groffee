import { Hono } from "hono";
import {
  db,
  repositories,
  users,
  gitRefs,
  gitCommits,
  gitCommitAncestry,
  gitTreeEntries,
  gitBlobs,
  gitCommitFiles,
  auditLogs,
} from "@groffee/db";
import { eq, and, like, desc, asc, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import {
  initBareRepo,
  getTree,
  getBlob,
  getCommitLog,
  getCommit,
  listRefs,
  resolveHead,
  getLastCommitsForPaths,
} from "@groffee/git";
import { getDiff } from "@groffee/git";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppEnv } from "../types.js";
import { logAudit, getClientIp } from "../lib/audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = process.env.DATA_DIR || path.resolve(PROJECT_ROOT, "data", "repositories");

export const repoRoutes = new Hono<AppEnv>();

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
  const owners =
    ownerIds.length > 0
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

  // Count total matching repos for pagination
  let total: number;
  if (q) {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(repositories)
      .where(and(eq(repositories.isPublic, true), like(repositories.name, `%${q}%`)));
    total = row.count;
  } else {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(repositories)
      .where(eq(repositories.isPublic, true));
    total = row.count;
  }

  return c.json({ repositories: result, total });
});

// Create repository
repoRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const { name, description, isPublic = true } = await c.req.json();

  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return c.json(
      {
        error:
          "Invalid repository name. Use alphanumeric characters, dots, hyphens, and underscores.",
      },
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

  logAudit({
    userId: user.id,
    action: "repo.create",
    targetType: "repository",
    targetId: id,
    metadata: { name, isPublic },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    repository: { id, name, description, isPublic, owner: user.username },
  });
});

// List repositories for a user
repoRoutes.get("/:owner", optionalAuth, async (c) => {
  const ownerName = c.req.param("owner");

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);

  if (!owner) return c.json({ error: "User not found" }, 404);

  const currentUser = c.get("user") as { id: string } | undefined;
  const isOwner = currentUser?.id === owner.id;

  const repos = isOwner
    ? await db.select().from(repositories).where(eq(repositories.ownerId, owner.id))
    : await db
        .select()
        .from(repositories)
        .where(and(eq(repositories.ownerId, owner.id), eq(repositories.isPublic, true)));

  return c.json({ repositories: repos });
});

// Get single repository
repoRoutes.get("/:owner/:name", optionalAuth, async (c) => {
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("name");

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);

  if (!owner) return c.json({ error: "User not found" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const currentUser = c.get("user") as { id: string } | undefined;
  if (!repo.isPublic && currentUser?.id !== owner.id) {
    return c.json({ error: "Repository not found" }, 404);
  }

  // Resolve actual HEAD branch from the git repo on disk
  const headBranch = await resolveHead(repo.diskPath);
  const defaultBranch = headBranch || repo.defaultBranch;

  return c.json({ repository: { ...repo, defaultBranch, owner: ownerName } });
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
  if (typeof body.defaultBranch === "string" && body.defaultBranch)
    updates.defaultBranch = body.defaultBranch;

  await db.update(repositories).set(updates).where(eq(repositories.id, repo.id));

  logAudit({
    userId: user.id,
    action: "repo.update",
    targetType: "repository",
    targetId: repo.id,
    metadata: updates,
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  const [updated] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repo.id))
    .limit(1);
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

  // Delete from DB (cascades to issues, PRs, comments, and all git index tables)
  await db.delete(repositories).where(eq(repositories.id, repo.id));

  // Delete bare git repo from disk
  const { rm } = await import("node:fs/promises");
  try {
    await rm(repo.diskPath, { recursive: true, force: true });
  } catch {
    // Best effort — DB record is already gone
  }

  logAudit({
    userId: user.id,
    action: "repo.delete",
    targetType: "repository",
    targetId: repo.id,
    metadata: { name: repoName },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});

// Helper: resolve repo from owner/name params, respecting visibility
async function findRepo(ownerName: string, repoName: string, currentUserId?: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);

  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);

  if (!repo) return null;

  // Private repos only visible to their owner
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return repo;
}

// Helper: resolve ref name from a combined "ref/path" string using indexed refs
async function resolveRefAndPath(
  repoId: string,
  defaultBranch: string,
  refAndPath: string,
): Promise<{ ref: string; subPath: string; fromIndex: boolean }> {
  // Try to resolve against indexed refs first
  const indexedRefs = await db
    .select({ name: gitRefs.name })
    .from(gitRefs)
    .where(eq(gitRefs.repoId, repoId));

  const refNames = indexedRefs.map((r) => r.name);

  if (refNames.length > 0) {
    const parts = refAndPath.split("/");
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        return { ref: candidate, subPath: parts.slice(i).join("/"), fromIndex: true };
      }
    }
    // No match — use first segment as ref
    if (parts.length > 0) {
      return { ref: parts[0], subPath: parts.slice(1).join("/"), fromIndex: true };
    }
  }

  return { ref: defaultBranch, subPath: refAndPath, fromIndex: false };
}

// Get refs (branches + tags)
repoRoutes.get("/:owner/:name/refs", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  // Try indexed refs first
  const indexedRefs = await db
    .select({
      name: gitRefs.name,
      oid: gitRefs.commitOid,
      type: gitRefs.type,
    })
    .from(gitRefs)
    .where(eq(gitRefs.repoId, repo.id));

  if (indexedRefs.length > 0) {
    const headBranch = await resolveHead(repo.diskPath);
    return c.json({ refs: indexedRefs, defaultBranch: headBranch || repo.defaultBranch });
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const headBranch = await resolveHead(repo.diskPath);
    return c.json({ refs, defaultBranch: headBranch || repo.defaultBranch });
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
  const { ref, subPath: treePath } = await resolveRefAndPath(
    repo.id,
    repo.defaultBranch,
    refAndPath,
  );

  // Try indexed data first
  try {
    const [refRecord] = await db
      .select({ commitOid: gitRefs.commitOid })
      .from(gitRefs)
      .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, ref)))
      .limit(1);

    if (refRecord) {
      const [commitRecord] = await db
        .select({ treeOid: gitCommits.treeOid })
        .from(gitCommits)
        .where(and(eq(gitCommits.repoId, repo.id), eq(gitCommits.oid, refRecord.commitOid)))
        .limit(1);

      if (commitRecord) {
        // Fetch tree entries for this directory
        const entries = await db
          .select({
            name: gitTreeEntries.entryName,
            path: gitTreeEntries.entryPath,
            type: gitTreeEntries.entryType,
            oid: gitTreeEntries.entryOid,
          })
          .from(gitTreeEntries)
          .where(
            and(
              eq(gitTreeEntries.repoId, repo.id),
              eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
              eq(gitTreeEntries.parentPath, treePath),
            ),
          )
          .orderBy(desc(gitTreeEntries.entryType), asc(gitTreeEntries.entryName));

        if (entries.length > 0) {
          // Get last commit per path via indexed data
          const paths = entries.map((e) => e.path);
          const lastCommitRows = await db
            .select({
              filePath: gitCommitFiles.filePath,
              commitOid: gitCommitAncestry.commitOid,
              depth: gitCommitAncestry.depth,
              message: gitCommits.message,
              authorTimestamp: gitCommits.authorTimestamp,
              authorName: gitCommits.authorName,
              authorEmail: gitCommits.authorEmail,
            })
            .from(gitCommitFiles)
            .innerJoin(
              gitCommitAncestry,
              and(
                eq(gitCommitAncestry.repoId, gitCommitFiles.repoId),
                eq(gitCommitAncestry.commitOid, gitCommitFiles.commitOid),
                eq(gitCommitAncestry.refName, ref),
              ),
            )
            .innerJoin(
              gitCommits,
              and(
                eq(gitCommits.repoId, gitCommitFiles.repoId),
                eq(gitCommits.oid, gitCommitFiles.commitOid),
              ),
            )
            .where(
              and(
                eq(gitCommitFiles.repoId, repo.id),
                sql`${gitCommitFiles.filePath} IN ${paths}`,
              ),
            )
            .orderBy(asc(gitCommitAncestry.depth));

          // Take the first (shallowest depth = most recent) result per path
          const lastCommitMap = new Map<
            string,
            { oid: string; message: string; timestamp: number; author: string; authorEmail: string }
          >();
          for (const row of lastCommitRows) {
            if (!lastCommitMap.has(row.filePath)) {
              lastCommitMap.set(row.filePath, {
                oid: row.commitOid,
                message: row.message,
                timestamp: row.authorTimestamp,
                author: row.authorName,
                authorEmail: row.authorEmail,
              });
            }
          }

          const entriesWithCommits = entries.map((entry) => ({
            ...entry,
            lastCommit: lastCommitMap.get(entry.path) || null,
          }));

          return c.json({ entries: entriesWithCommits, ref, path: treePath });
        }
      }
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const refNames = refs.map((r) => r.name);

    // Re-resolve ref from git refs if index resolution failed
    let gitRef = ref;
    let gitTreePath = treePath;
    const parts = refAndPath.split("/");
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        gitRef = candidate;
        gitTreePath = parts.slice(i).join("/");
        break;
      }
    }

    const entries = await getTree(repo.diskPath, gitRef, gitTreePath);
    const paths = entries.map((e) => e.path);
    const lastCommits = await getLastCommitsForPaths(repo.diskPath, gitRef, paths);

    const entriesWithCommits = entries.map((entry) => {
      const commit = lastCommits.get(entry.path);
      return {
        ...entry,
        lastCommit: commit || null,
      };
    });

    return c.json({ entries: entriesWithCommits, ref: gitRef, path: gitTreePath });
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
  const { ref, subPath: filePath } = await resolveRefAndPath(
    repo.id,
    repo.defaultBranch,
    refAndPath,
  );

  // Try indexed data first
  try {
    const [refRecord] = await db
      .select({ commitOid: gitRefs.commitOid })
      .from(gitRefs)
      .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, ref)))
      .limit(1);

    if (refRecord) {
      const [commitRecord] = await db
        .select({ treeOid: gitCommits.treeOid })
        .from(gitCommits)
        .where(and(eq(gitCommits.repoId, repo.id), eq(gitCommits.oid, refRecord.commitOid)))
        .limit(1);

      if (commitRecord) {
        const [treeEntry] = await db
          .select({ entryOid: gitTreeEntries.entryOid })
          .from(gitTreeEntries)
          .where(
            and(
              eq(gitTreeEntries.repoId, repo.id),
              eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
              eq(gitTreeEntries.entryPath, filePath),
            ),
          )
          .limit(1);

        if (treeEntry) {
          const [blob] = await db
            .select()
            .from(gitBlobs)
            .where(and(eq(gitBlobs.repoId, repo.id), eq(gitBlobs.oid, treeEntry.entryOid)))
            .limit(1);

          if (blob) {
            if (blob.isBinary) {
              return c.json({
                content: null,
                isBinary: true,
                oid: blob.oid,
                size: blob.size,
                ref,
                path: filePath,
              });
            }
            if (blob.isTruncated) {
              // Fall through to git for full content
            } else {
              return c.json({ content: blob.content, oid: blob.oid, ref, path: filePath });
            }
          }
        }
      }
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const refNames = refs.map((r) => r.name);

    let gitRef = ref;
    let gitFilePath = filePath;
    const parts = refAndPath.split("/");
    for (let i = parts.length - 1; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        gitRef = candidate;
        gitFilePath = parts.slice(i).join("/");
        break;
      }
    }

    const { content, oid } = await getBlob(repo.diskPath, gitRef, gitFilePath);
    const text = new TextDecoder().decode(content);
    return c.json({ content: text, oid, ref: gitRef, path: gitFilePath });
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

  // Try indexed data first
  try {
    const commitList = await db
      .select({
        oid: gitCommits.oid,
        message: gitCommits.message,
        authorName: gitCommits.authorName,
        authorEmail: gitCommits.authorEmail,
        authorTimestamp: gitCommits.authorTimestamp,
        committerName: gitCommits.committerName,
        committerEmail: gitCommits.committerEmail,
        committerTimestamp: gitCommits.committerTimestamp,
        parentOids: gitCommits.parentOids,
      })
      .from(gitCommitAncestry)
      .innerJoin(
        gitCommits,
        and(
          eq(gitCommits.repoId, gitCommitAncestry.repoId),
          eq(gitCommits.oid, gitCommitAncestry.commitOid),
        ),
      )
      .where(
        and(eq(gitCommitAncestry.repoId, repo.id), eq(gitCommitAncestry.refName, ref)),
      )
      .orderBy(asc(gitCommitAncestry.depth))
      .limit(limit);

    if (commitList.length > 0) {
      const commits = commitList.map((c) => ({
        oid: c.oid,
        message: c.message,
        author: {
          name: c.authorName,
          email: c.authorEmail,
          timestamp: c.authorTimestamp,
        },
        committer: {
          name: c.committerName,
          email: c.committerEmail,
          timestamp: c.committerTimestamp,
        },
        parents: JSON.parse(c.parentOids) as string[],
      }));
      return c.json({ commits, ref });
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git
  try {
    const commits = await getCommitLog(repo.diskPath, ref, limit);
    return c.json({ commits, ref });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read commits";
    return c.json({ error: message }, 404);
  }
});

// Get single commit with diff (always uses git for diff)
repoRoutes.get("/:owner/:name/commit/:sha", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const sha = c.req.param("sha");

  // Try indexed commit metadata
  try {
    const [indexed] = await db
      .select()
      .from(gitCommits)
      .where(and(eq(gitCommits.repoId, repo.id), eq(gitCommits.oid, sha)))
      .limit(1);

    if (indexed) {
      const parents = JSON.parse(indexed.parentOids) as string[];
      const commit = {
        oid: indexed.oid,
        message: indexed.message,
        author: {
          name: indexed.authorName,
          email: indexed.authorEmail,
          timestamp: indexed.authorTimestamp,
        },
        committer: {
          name: indexed.committerName,
          email: indexed.committerEmail,
          timestamp: indexed.committerTimestamp,
        },
        parents,
      };

      // Diff still comes from git (on-demand)
      let diff = null;
      if (parents.length > 0) {
        diff = await getDiff(repo.diskPath, parents[0], sha);
      }
      return c.json({ commit, diff });
    }
  } catch {
    // Fall through to git
  }

  // Fallback to git
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

// --- Raw blob (binary content with correct Content-Type) ---

const CONTENT_TYPE_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

repoRoutes.get("/:owner/:name/raw/:ref{.+}", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.text("Not found", 404);

  const refAndPath = c.req.param("ref");
  const { ref, subPath: filePath } = await resolveRefAndPath(
    repo.id,
    repo.defaultBranch,
    refAndPath,
  );

  try {
    // Try git CLI for raw binary content
    const refs = await listRefs(repo.diskPath);
    const refNames = refs.map((r) => r.name);

    let gitRef = ref;
    let gitFilePath = filePath;
    const parts = refAndPath.split("/");
    for (let i = parts.length - 1; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        gitRef = candidate;
        gitFilePath = parts.slice(i).join("/");
        break;
      }
    }

    const { content } = await getBlob(repo.diskPath, gitRef, gitFilePath);

    const ext = gitFilePath.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPE_MAP[ext] || "application/octet-stream";

    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read file";
    return c.text(message, 404);
  }
});

// --- Repository activity (commit heatmap + contributors) ---

repoRoutes.get("/:owner/:name/activity", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 86400;

  // Daily commit counts for heatmap (last 365 days)
  const dailyRows = await db
    .select({
      day: sql<number>`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(
      and(eq(gitCommits.repoId, repo.id), sql`${gitCommits.authorTimestamp} >= ${oneYearAgo}`),
    )
    .groupBy(sql`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`)
    .orderBy(sql`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`);

  // Weekly commit counts (last 52 weeks)
  const weeklyRows = await db
    .select({
      week: sql<number>`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(
      and(eq(gitCommits.repoId, repo.id), sql`${gitCommits.authorTimestamp} >= ${oneYearAgo}`),
    )
    .groupBy(sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`)
    .orderBy(sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`);

  // Top contributors (all time)
  const contributors = await db
    .select({
      name: gitCommits.authorName,
      email: gitCommits.authorEmail,
      commits: sql<number>`cast(count(*) as integer)`,
      lastCommitAt: sql<number>`cast(max(${gitCommits.authorTimestamp}) as integer)`,
    })
    .from(gitCommits)
    .where(eq(gitCommits.repoId, repo.id))
    .groupBy(gitCommits.authorEmail)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // Total commit count
  const [totalRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(gitCommits)
    .where(eq(gitCommits.repoId, repo.id));

  return c.json({
    daily: dailyRows,
    weekly: weeklyRows,
    contributors,
    totalCommits: totalRow?.count || 0,
  });
});

// --- Activity drill-down: commits by day or author ---

repoRoutes.get("/:owner/:name/activity/commits", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const repo = await findRepo(c.req.param("owner"), c.req.param("name"), currentUser?.id);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  const day = c.req.query("day"); // unix timestamp of day start
  const authorEmail = c.req.query("author");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);

  const conditions = [eq(gitCommits.repoId, repo.id)];

  if (day) {
    const dayStart = parseInt(day, 10);
    const dayEnd = dayStart + 86400;
    conditions.push(sql`${gitCommits.authorTimestamp} >= ${dayStart}`);
    conditions.push(sql`${gitCommits.authorTimestamp} < ${dayEnd}`);
  }

  if (authorEmail) {
    conditions.push(eq(gitCommits.authorEmail, authorEmail));
  }

  const rows = await db
    .select({
      oid: gitCommits.oid,
      message: gitCommits.message,
      authorName: gitCommits.authorName,
      authorEmail: gitCommits.authorEmail,
      authorTimestamp: gitCommits.authorTimestamp,
    })
    .from(gitCommits)
    .where(and(...conditions))
    .orderBy(sql`${gitCommits.authorTimestamp} desc`)
    .limit(limit);

  return c.json({
    commits: rows.map((r) => ({
      oid: r.oid,
      message: r.message,
      author: { name: r.authorName, email: r.authorEmail, timestamp: r.authorTimestamp },
    })),
  });
});

// --- Audit log for a repository (owner only) ---

repoRoutes.get("/:owner/:name/audit", requireAuth, async (c) => {
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

  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      username: users.username,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(and(eq(auditLogs.targetType, "repository"), eq(auditLogs.targetId, repo.id)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ logs });
});
