"use server";

import { db, repositories, users, repoCollaborators } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

export async function getCollaborators(ownerName: string, repoName: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "User not found" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  if (user.id !== owner.id) return { error: "Forbidden" };

  const collabs = await db
    .select({
      id: repoCollaborators.id,
      userId: repoCollaborators.userId,
      permission: repoCollaborators.permission,
      createdAt: repoCollaborators.createdAt,
    })
    .from(repoCollaborators)
    .where(eq(repoCollaborators.repoId, repo.id));

  const result = await Promise.all(
    collabs.map(async (collab) => {
      const [u] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, collab.userId))
        .limit(1);
      return {
        ...collab,
        createdAt: collab.createdAt instanceof Date ? collab.createdAt.toISOString() : collab.createdAt,
        username: u?.username || "unknown",
      };
    }),
  );

  return { collaborators: result };
}

export async function addCollaborator(
  ownerName: string,
  repoName: string,
  username: string,
  permission: string = "write",
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "User not found" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  if (user.id !== owner.id) return { error: "Forbidden" };

  if (!username) return { error: "Username is required" };
  if (!["read", "write", "admin"].includes(permission)) {
    return { error: "Permission must be read, write, or admin" };
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!targetUser) return { error: "User not found" };

  if (targetUser.id === owner.id) {
    return { error: "Cannot add the owner as a collaborator" };
  }

  const [existing] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, targetUser.id)))
    .limit(1);

  if (existing) return { error: "User is already a collaborator" };

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(repoCollaborators).values({
    id,
    repoId: repo.id,
    userId: targetUser.id,
    permission: permission as "read" | "write" | "admin",
    createdAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "collaborator.add",
    targetType: "collaborator",
    targetId: id,
    metadata: { username, permission, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { collaborator: { id, username, permission, createdAt: now.toISOString() } };
}

export async function removeCollaborator(
  ownerName: string,
  repoName: string,
  collabId: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "User not found" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  if (user.id !== owner.id) return { error: "Forbidden" };

  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.id, collabId), eq(repoCollaborators.repoId, repo.id)))
    .limit(1);

  if (!collab) return { error: "Collaborator not found" };

  await db.delete(repoCollaborators).where(eq(repoCollaborators.id, collabId));

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "collaborator.remove",
    targetType: "collaborator",
    targetId: collabId,
    metadata: { repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
