import { Hono } from "hono";
import { db, repositories, users, repoInvites, repoCollaborators } from "@groffee/db";
import { eq, and, desc, isNull, or, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import type { AppEnv } from "../types.js";

export const inviteRoutes = new Hono<AppEnv>();

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

async function resolveRepoForOwnerOrAdmin(ownerName: string, repoName: string, userId: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" as const };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" as const };

  if (userId === owner.id) return { repo, owner };

  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, userId)))
    .limit(1);
  if (!collab || collab.permission !== "admin") return { error: "Forbidden" as const };

  return { repo, owner };
}

// List invites for a repo (owner / admin collaborator only)
inviteRoutes.get("/:owner/:repo/invites", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await resolveRepoForOwnerOrAdmin(c.req.param("owner"), c.req.param("repo"), user.id);
  if ("error" in ctx) return c.json({ error: ctx.error }, ctx.error === "Forbidden" ? 403 : 404);

  const rows = await db
    .select({
      id: repoInvites.id,
      token: repoInvites.token,
      permission: repoInvites.permission,
      createdAt: repoInvites.createdAt,
      expiresAt: repoInvites.expiresAt,
      usedAt: repoInvites.usedAt,
      usedById: repoInvites.usedById,
      createdById: repoInvites.createdById,
    })
    .from(repoInvites)
    .where(eq(repoInvites.repoId, ctx.repo.id))
    .orderBy(desc(repoInvites.createdAt));

  return c.json({ invites: rows });
});

// Create invite (owner / admin collaborator only)
inviteRoutes.post("/:owner/:repo/invites", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await resolveRepoForOwnerOrAdmin(c.req.param("owner"), c.req.param("repo"), user.id);
  if ("error" in ctx) return c.json({ error: ctx.error }, ctx.error === "Forbidden" ? 403 : 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    permission?: string;
    expiresInHours?: number;
  };
  const permission = (body.permission || "write") as "read" | "write" | "admin";
  if (!["read", "write", "admin"].includes(permission)) {
    return c.json({ error: "Permission must be read, write, or admin" }, 400);
  }

  const now = new Date();
  const expiresAt =
    body.expiresInHours && body.expiresInHours > 0
      ? new Date(now.getTime() + body.expiresInHours * 60 * 60 * 1000)
      : null;

  const id = crypto.randomUUID();
  const token = generateToken();

  await db.insert(repoInvites).values({
    id,
    token,
    repoId: ctx.repo.id,
    permission,
    createdById: user.id,
    createdAt: now,
    expiresAt,
    usedAt: null,
    usedById: null,
  });

  logAudit({
    userId: user.id,
    action: "invite.create",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { permission, expiresAt: expiresAt?.toISOString() ?? null, inviteId: id },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    invite: { id, token, permission, createdAt: now, expiresAt },
  });
});

// Revoke invite (owner / admin collaborator only)
inviteRoutes.delete("/:owner/:repo/invites/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const ctx = await resolveRepoForOwnerOrAdmin(c.req.param("owner"), c.req.param("repo"), user.id);
  if ("error" in ctx) return c.json({ error: ctx.error }, ctx.error === "Forbidden" ? 403 : 404);

  const inviteId = c.req.param("id");
  const [invite] = await db
    .select()
    .from(repoInvites)
    .where(and(eq(repoInvites.id, inviteId), eq(repoInvites.repoId, ctx.repo.id)))
    .limit(1);
  if (!invite) return c.json({ error: "Invite not found" }, 404);
  if (invite.usedAt != null) return c.json({ error: "Invite already used or revoked" }, 400);

  await db.update(repoInvites).set({ usedAt: new Date() }).where(eq(repoInvites.id, invite.id));

  logAudit({
    userId: user.id,
    action: "invite.revoke",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { inviteId },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ revoked: true });
});

// Accept invite by token. Mounted at /api/invite/:token/accept (no repo prefix).
export const inviteAcceptRoutes = new Hono<AppEnv>();

inviteAcceptRoutes.post("/invite/:token/accept", requireAuth, async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");
  const now = new Date();

  const [invite] = await db
    .select()
    .from(repoInvites)
    .where(
      and(
        eq(repoInvites.token, token),
        isNull(repoInvites.usedAt),
        or(isNull(repoInvites.expiresAt), gt(repoInvites.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!invite) return c.json({ error: "Invite is invalid, expired, or already used" }, 404);

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, invite.repoId))
    .limit(1);
  if (!repo) return c.json({ error: "Repository not found" }, 404);

  if (repo.ownerId === user.id) {
    return c.json({ error: "You are the repository owner; you cannot accept this invite" }, 400);
  }

  const [existing] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, user.id)))
    .limit(1);

  if (!existing) {
    await db.insert(repoCollaborators).values({
      id: crypto.randomUUID(),
      repoId: repo.id,
      userId: user.id,
      permission: invite.permission,
      createdAt: now,
    });
  }

  await db
    .update(repoInvites)
    .set({ usedAt: now, usedById: user.id })
    .where(eq(repoInvites.id, invite.id));

  const [owner] = await db.select().from(users).where(eq(users.id, repo.ownerId)).limit(1);

  logAudit({
    userId: user.id,
    action: "invite.accept",
    targetType: "repository",
    targetId: repo.id,
    metadata: { inviteId: invite.id, permission: invite.permission },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    accepted: true,
    repo: { owner: owner?.username || "unknown", name: repo.name },
    permission: invite.permission,
    alreadyMember: !!existing,
  });
});
