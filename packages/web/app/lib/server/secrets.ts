"use server";

import { db, repositories, users, repoSecrets } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { getSessionUser } from "./session.js";
import { logAudit, getClientIp } from "./audit.js";
import { getRequest } from "./request-context.js";
import { encryptSecret } from "../../api/lib/secret-crypto.js";
import { isRepoArchivedById } from "./repos.js";

const ARCHIVED_ERROR = "This repository is archived and is read-only.";

const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;
// Prevents pathological values from blowing up DB rows / docker --env arg
// length. 64KiB is a generous cap for typical CI tokens.
const MAX_SECRET_VALUE_BYTES = 64 * 1024;

interface RepoCtx {
  repoId: string;
  userId: string;
  username: string;
  isOwner: true;
}

/**
 * Resolve the repo + check that the caller is the owner. Secrets are
 * deliberately owner-only for v1 (write-permission collaborators can push
 * code, so granting them read-access to plaintext secrets at injection time
 * is necessary, but they should not be able to ROTATE or LIST the names).
 */
async function requireOwnerRepo(
  ownerName: string,
  repoName: string,
): Promise<RepoCtx | { error: string }> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" };

  const [repo] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  if (sessionUser.id !== owner.id) return { error: "Forbidden" };

  return {
    repoId: repo.id,
    userId: sessionUser.id,
    username: sessionUser.username,
    isOwner: true,
  };
}

function validateName(name: string): string | null {
  if (!name || typeof name !== "string") return "name is required";
  if (name.length > 64) return "name must be 64 characters or fewer";
  if (!SECRET_NAME_REGEX.test(name)) {
    return "name must match /^[A-Z][A-Z0-9_]*$/ (uppercase + digits + underscore, leading letter)";
  }
  return null;
}

function validateValue(value: string): string | null {
  if (typeof value !== "string") return "value must be a string";
  if (value.length === 0) return "value cannot be empty";
  if (Buffer.byteLength(value, "utf-8") > MAX_SECRET_VALUE_BYTES) {
    return `value must be smaller than ${MAX_SECRET_VALUE_BYTES} bytes`;
  }
  return null;
}

/** Lists names + metadata only — never returns ciphertext or plaintext. */
export async function listRepoSecrets(ownerName: string, repoName: string) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  const rows = await db
    .select({
      id: repoSecrets.id,
      name: repoSecrets.name,
      createdAt: repoSecrets.createdAt,
      updatedAt: repoSecrets.updatedAt,
      lastUsedAt: repoSecrets.lastUsedAt,
      createdById: repoSecrets.createdById,
    })
    .from(repoSecrets)
    .where(eq(repoSecrets.repoId, ctx.repoId));

  // Resolve creator usernames in one pass (homelab-scale: < 50 secrets).
  const creatorIds = [...new Set(rows.map((r) => r.createdById))];
  const creators = creatorIds.length
    ? await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, creatorIds[0]))
    : [];
  // For multiple creators, fall back to a per-id lookup (still fine at this
  // scale — keeps the query simple and avoids `inArray` import noise).
  const creatorMap = new Map<string, string>();
  for (const c of creators) creatorMap.set(c.id, c.username);
  for (const id of creatorIds) {
    if (!creatorMap.has(id)) {
      const [u] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (u) creatorMap.set(id, u.username);
    }
  }

  return {
    secrets: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: creatorMap.get(r.createdById) || "unknown",
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      lastUsedAt:
        r.lastUsedAt instanceof Date ? r.lastUsedAt.toISOString() : (r.lastUsedAt ?? null),
    })),
  };
}

export async function createRepoSecret(
  ownerName: string,
  repoName: string,
  name: string,
  value: string,
) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };
  if (await isRepoArchivedById(ctx.repoId)) return { error: ARCHIVED_ERROR };

  const nameErr = validateName(name);
  if (nameErr) return { error: nameErr };
  const valueErr = validateValue(value);
  if (valueErr) return { error: valueErr };

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, ctx.repoId), eq(repoSecrets.name, name)))
    .limit(1);
  if (existing) {
    return { error: `Secret "${name}" already exists; use Update to rotate it` };
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const ciphertext = encryptSecret(value);

  await db.insert(repoSecrets).values({
    id,
    repoId: ctx.repoId,
    name,
    ciphertext,
    createdById: ctx.userId,
    createdAt: now,
    updatedAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: ctx.userId,
    action: "secret.create",
    targetType: "repo_secret",
    targetId: id,
    // Metadata records the NAME only — never the value.
    metadata: { name, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    secret: {
      id,
      name,
      createdBy: ctx.username,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastUsedAt: null,
    },
  };
}

export async function updateRepoSecret(
  ownerName: string,
  repoName: string,
  name: string,
  value: string,
) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };
  if (await isRepoArchivedById(ctx.repoId)) return { error: ARCHIVED_ERROR };

  const nameErr = validateName(name);
  if (nameErr) return { error: nameErr };
  const valueErr = validateValue(value);
  if (valueErr) return { error: valueErr };

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, ctx.repoId), eq(repoSecrets.name, name)))
    .limit(1);
  if (!existing) return { error: `Secret "${name}" does not exist` };

  const ciphertext = encryptSecret(value);
  const now = new Date();
  await db
    .update(repoSecrets)
    .set({ ciphertext, updatedAt: now })
    .where(eq(repoSecrets.id, existing.id));

  const req = getRequest();
  logAudit({
    userId: ctx.userId,
    action: "secret.update",
    targetType: "repo_secret",
    targetId: existing.id,
    metadata: { name, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { updated: true, name, updatedAt: now.toISOString() };
}

export async function deleteRepoSecret(ownerName: string, repoName: string, name: string) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };
  if (await isRepoArchivedById(ctx.repoId)) return { error: ARCHIVED_ERROR };

  const nameErr = validateName(name);
  if (nameErr) return { error: nameErr };

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, ctx.repoId), eq(repoSecrets.name, name)))
    .limit(1);
  if (!existing) return { error: `Secret "${name}" does not exist` };

  await db.delete(repoSecrets).where(eq(repoSecrets.id, existing.id));

  const req = getRequest();
  logAudit({
    userId: ctx.userId,
    action: "secret.delete",
    targetType: "repo_secret",
    targetId: existing.id,
    metadata: { name, repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
