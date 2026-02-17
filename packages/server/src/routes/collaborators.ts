import { Hono } from "hono";
import { db, repositories, users, repoCollaborators } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import type { AppEnv } from "../types.js";

export const collaboratorRoutes = new Hono<AppEnv>();

collaboratorRoutes.use("*", requireAuth);

// List collaborators for a repo
collaboratorRoutes.get("/:owner/:repo/collaborators", async (c) => {
  const user = c.get("user");
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("repo");

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return c.json({ error: "User not found" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  // Only owner can manage collaborators
  if (user.id !== owner.id) return c.json({ error: "Forbidden" }, 403);

  const collabs = await db
    .select({
      id: repoCollaborators.id,
      userId: repoCollaborators.userId,
      permission: repoCollaborators.permission,
      createdAt: repoCollaborators.createdAt,
    })
    .from(repoCollaborators)
    .where(eq(repoCollaborators.repoId, repo.id));

  // Attach usernames
  const result = await Promise.all(
    collabs.map(async (collab) => {
      const [u] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, collab.userId))
        .limit(1);
      return { ...collab, username: u?.username || "unknown" };
    }),
  );

  return c.json({ collaborators: result });
});

// Add a collaborator
collaboratorRoutes.post("/:owner/:repo/collaborators", async (c) => {
  const user = c.get("user");
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("repo");

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return c.json({ error: "User not found" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  if (user.id !== owner.id) return c.json({ error: "Forbidden" }, 403);

  const { username, permission = "write" } = await c.req.json();

  if (!username) return c.json({ error: "Username is required" }, 400);
  if (!["read", "write", "admin"].includes(permission)) {
    return c.json({ error: "Permission must be read, write, or admin" }, 400);
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!targetUser) return c.json({ error: "User not found" }, 404);

  if (targetUser.id === owner.id) {
    return c.json({ error: "Cannot add the owner as a collaborator" }, 400);
  }

  // Check if already a collaborator
  const [existing] = await db
    .select()
    .from(repoCollaborators)
    .where(
      and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, targetUser.id)),
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "User is already a collaborator" }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(repoCollaborators).values({
    id,
    repoId: repo.id,
    userId: targetUser.id,
    permission,
    createdAt: now,
  });

  logAudit({
    userId: user.id,
    action: "collaborator.add",
    targetType: "collaborator",
    targetId: id,
    metadata: { username, permission, repoName: c.req.param("repo") },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    collaborator: { id, username, permission, createdAt: now },
  });
});

// Remove a collaborator
collaboratorRoutes.delete("/:owner/:repo/collaborators/:collabId", async (c) => {
  const user = c.get("user");
  const ownerName = c.req.param("owner");
  const repoName = c.req.param("repo");
  const collabId = c.req.param("collabId");

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return c.json({ error: "User not found" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  if (user.id !== owner.id) return c.json({ error: "Forbidden" }, 403);

  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.id, collabId), eq(repoCollaborators.repoId, repo.id)))
    .limit(1);

  if (!collab) return c.json({ error: "Collaborator not found" }, 404);

  await db.delete(repoCollaborators).where(eq(repoCollaborators.id, collabId));

  logAudit({
    userId: user.id,
    action: "collaborator.remove",
    targetType: "collaborator",
    targetId: collabId,
    metadata: { repoName: c.req.param("repo") },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});
