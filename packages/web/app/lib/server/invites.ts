"use server";

import { db, repositories, users, repoInvites, repoCollaborators } from "@groffee/db";
import { eq, and, desc, gt, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";
import { isRepoArchivedById } from "./repos";

const ARCHIVED_ERROR = "This repository is archived and is read-only.";

/**
 * Generate a high-entropy URL-safe invite token. 24 bytes -> 32 base64url chars.
 */
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Resolve `<owner>/<repo>` and require the caller to be the repo owner OR
 * a collaborator with `admin` permission. Anything less is forbidden.
 */
async function requireOwnerOrAdmin(ownerName: string, repoName: string) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" as const };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" as const };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" as const };

  if (sessionUser.id === owner.id) {
    return { sessionUser, repo, owner, isOwner: true as const };
  }

  // Allow collaborators with admin permission
  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, sessionUser.id)))
    .limit(1);
  if (!collab || collab.permission !== "admin") return { error: "Forbidden" as const };

  return { sessionUser, repo, owner, isOwner: false as const };
}

export async function createRepoInvite(
  ownerName: string,
  repoName: string,
  opts: { permission?: "read" | "write" | "admin"; expiresInHours?: number } = {},
) {
  const ctx = await requireOwnerOrAdmin(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };
  if (await isRepoArchivedById(ctx.repo.id)) return { error: ARCHIVED_ERROR };

  const permission = opts.permission ?? "write";
  if (!["read", "write", "admin"].includes(permission)) {
    return { error: "Permission must be read, write, or admin" };
  }

  const now = new Date();
  const expiresAt =
    opts.expiresInHours && opts.expiresInHours > 0
      ? new Date(now.getTime() + opts.expiresInHours * 60 * 60 * 1000)
      : null;

  const id = crypto.randomUUID();
  const token = generateToken();

  await db.insert(repoInvites).values({
    id,
    token,
    repoId: ctx.repo.id,
    permission,
    createdById: ctx.sessionUser.id,
    createdAt: now,
    expiresAt,
    usedAt: null,
    usedById: null,
  });

  const req = getRequest();
  logAudit({
    userId: ctx.sessionUser.id,
    action: "invite.create",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { permission, expiresAt: expiresAt?.toISOString() ?? null, inviteId: id },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    invite: {
      id,
      token,
      permission,
      createdAt: now.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

export async function listRepoInvites(ownerName: string, repoName: string) {
  const ctx = await requireOwnerOrAdmin(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  const now = new Date();

  const allRows = await db
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

  // Resolve usernames in batch
  const userIds = new Set<string>();
  for (const row of allRows) {
    userIds.add(row.createdById);
    if (row.usedById) userIds.add(row.usedById);
  }
  const userRows =
    userIds.size > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(or(...Array.from(userIds).map((id) => eq(users.id, id))))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.username]));

  const active: typeof out = [];
  const used: typeof out = [];
  type Out = {
    id: string;
    token: string;
    permission: string;
    createdAt: string;
    expiresAt: string | null;
    usedAt: string | null;
    createdBy: string;
    usedBy: string | null;
    expired: boolean;
  };
  // eslint-disable-next-line prefer-const
  let out: Out[] = [];

  for (const row of allRows) {
    const expired = row.expiresAt instanceof Date && row.expiresAt < now;
    const item: Out = {
      id: row.id,
      token: row.token,
      permission: row.permission,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      expiresAt:
        row.expiresAt instanceof Date ? row.expiresAt.toISOString() : (row.expiresAt as null),
      usedAt: row.usedAt instanceof Date ? row.usedAt.toISOString() : (row.usedAt as null),
      createdBy: userMap.get(row.createdById) || "unknown",
      usedBy: row.usedById ? userMap.get(row.usedById) || "unknown" : null,
      expired,
    };
    if (row.usedAt == null && !expired) active.push(item);
    else used.push(item);
  }

  // Cap "used/expired" at 50 — owners rarely need ancient history.
  return { active, used: used.slice(0, 50) };
}

export async function revokeRepoInvite(ownerName: string, repoName: string, inviteId: string) {
  const ctx = await requireOwnerOrAdmin(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  const [invite] = await db
    .select()
    .from(repoInvites)
    .where(and(eq(repoInvites.id, inviteId), eq(repoInvites.repoId, ctx.repo.id)))
    .limit(1);
  if (!invite) return { error: "Invite not found" };

  if (invite.usedAt != null) return { error: "Invite already used or revoked" };

  // Mark as "used" so it can no longer be redeemed. We don't have a separate
  // revoked-at column — usedAt with usedById = null is the convention.
  const now = new Date();
  await db.update(repoInvites).set({ usedAt: now }).where(eq(repoInvites.id, invite.id));

  const req = getRequest();
  logAudit({
    userId: ctx.sessionUser.id,
    action: "invite.revoke",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { inviteId },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { revoked: true };
}

/**
 * Look up an invite by token without consuming it. Used by the
 * /invite/:token landing page to show preview info.
 */
export async function getRepoInviteByToken(token: string) {
  if (!token) return { error: "Invalid invite" };

  const [invite] = await db.select().from(repoInvites).where(eq(repoInvites.token, token)).limit(1);
  if (!invite) return { error: "Invite not found" };

  const now = new Date();
  const expired = invite.expiresAt instanceof Date && invite.expiresAt < now;
  const used = invite.usedAt != null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, invite.repoId))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  const [owner] = await db.select().from(users).where(eq(users.id, repo.ownerId)).limit(1);
  const [creator] = await db.select().from(users).where(eq(users.id, invite.createdById)).limit(1);

  return {
    invite: {
      id: invite.id,
      permission: invite.permission,
      expiresAt:
        invite.expiresAt instanceof Date
          ? invite.expiresAt.toISOString()
          : (invite.expiresAt as null),
      expired,
      used,
      repo: {
        owner: owner?.username || "unknown",
        name: repo.name,
        description: repo.description,
        isPublic: repo.isPublic,
      },
      createdBy: creator?.username || "unknown",
    },
  };
}

export async function acceptRepoInvite(token: string) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };
  if (!token) return { error: "Invalid invite" };

  // Look up invite within a guard window — must be unused AND not expired.
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
  if (!invite) return { error: "Invite is invalid, expired, or already used" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, invite.repoId))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  const [owner] = await db.select().from(users).where(eq(users.id, repo.ownerId)).limit(1);
  if (!owner) return { error: "Repository owner not found" };

  // Owner cannot accept their own invite — surfaces a clearer error than the
  // collaborator-row insert silently succeeding-or-failing on uniqueness.
  if (owner.id === sessionUser.id) {
    return { error: "You are the repository owner; you cannot accept this invite" };
  }

  // If user is already a collaborator, mark the invite consumed and return
  // success so the link is not held open against re-clicks.
  const [existing] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, sessionUser.id)))
    .limit(1);

  if (!existing) {
    await db.insert(repoCollaborators).values({
      id: crypto.randomUUID(),
      repoId: repo.id,
      userId: sessionUser.id,
      permission: invite.permission,
      createdAt: now,
    });
  }

  await db
    .update(repoInvites)
    .set({ usedAt: now, usedById: sessionUser.id })
    .where(eq(repoInvites.id, invite.id));

  const req = getRequest();
  logAudit({
    userId: sessionUser.id,
    action: "invite.accept",
    targetType: "repository",
    targetId: repo.id,
    metadata: { inviteId: invite.id, permission: invite.permission },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    accepted: true,
    repo: { owner: owner.username, name: repo.name },
    permission: invite.permission,
    alreadyMember: !!existing,
  };
}
