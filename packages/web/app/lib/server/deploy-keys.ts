"use server";

import { db, repositories, users, deployKeys } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

const VALID_KEY_TYPES = [
  "ssh-rsa",
  "ssh-ed25519",
  "ssh-dss",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
];

/**
 * Compute the SHA-256 fingerprint of an SSH public key in OpenSSH format
 * ("ssh-... base64 [comment]"), matching the format `ssh-keygen -lf` emits.
 * Mirrors the helper in `lib/server/keys.ts` — kept duplicated rather than
 * shared so each module's policy (key types, format) can evolve independently.
 */
function generateFingerprint(publicKey: string): string | null {
  const trimmed = publicKey.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const keyType = parts[0];
  if (!VALID_KEY_TYPES.includes(keyType)) return null;

  const keyData = parts[1];
  let decoded: Buffer;
  try {
    decoded = Buffer.from(keyData, "base64");
    if (decoded.toString("base64") !== keyData) return null;
    if (decoded.length < 16) return null;
  } catch {
    return null;
  }

  const hash = createHash("sha256").update(decoded).digest("base64");
  return `SHA256:${hash.replace(/=+$/, "")}`;
}

async function requireOwnerRepo(ownerName: string, repoName: string) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" as const };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" as const };

  const [repo] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" as const };
  if (sessionUser.id !== owner.id) return { error: "Forbidden" as const };

  return { sessionUser, repo };
}

export async function listDeployKeys(ownerName: string, repoName: string) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  const rows = await db
    .select({
      id: deployKeys.id,
      name: deployKeys.name,
      fingerprint: deployKeys.fingerprint,
      readOnly: deployKeys.readOnly,
      createdAt: deployKeys.createdAt,
    })
    .from(deployKeys)
    .where(eq(deployKeys.repoId, ctx.repo.id));

  return {
    keys: rows.map((k) => ({
      ...k,
      createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt,
    })),
  };
}

export async function addDeployKey(
  ownerName: string,
  repoName: string,
  name: string,
  publicKey: string,
  readOnly: boolean = true,
) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  if (!name?.trim()) return { error: "Name is required" };
  if (!publicKey?.trim()) return { error: "Public key is required" };

  const fingerprint = generateFingerprint(publicKey.trim());
  if (!fingerprint) return { error: "Invalid SSH public key format" };

  const [existing] = await db
    .select({ id: deployKeys.id })
    .from(deployKeys)
    .where(and(eq(deployKeys.repoId, ctx.repo.id), eq(deployKeys.fingerprint, fingerprint)))
    .limit(1);
  if (existing) return { error: "This deploy key is already registered for this repository" };

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(deployKeys).values({
    id,
    repoId: ctx.repo.id,
    name: name.trim(),
    publicKey: publicKey.trim(),
    fingerprint,
    readOnly,
    createdAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: ctx.sessionUser.id,
    action: "deploy_key.add",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { keyId: id, name: name.trim(), fingerprint, readOnly },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    key: {
      id,
      name: name.trim(),
      fingerprint,
      readOnly,
      createdAt: now.toISOString(),
    },
  };
}

export async function deleteDeployKey(ownerName: string, repoName: string, keyId: string) {
  const ctx = await requireOwnerRepo(ownerName, repoName);
  if ("error" in ctx) return { error: ctx.error };

  const [existing] = await db
    .select()
    .from(deployKeys)
    .where(and(eq(deployKeys.id, keyId), eq(deployKeys.repoId, ctx.repo.id)))
    .limit(1);
  if (!existing) return { error: "Deploy key not found" };

  await db.delete(deployKeys).where(eq(deployKeys.id, keyId));

  const req = getRequest();
  logAudit({
    userId: ctx.sessionUser.id,
    action: "deploy_key.delete",
    targetType: "repository",
    targetId: ctx.repo.id,
    metadata: { keyId, name: existing.name, fingerprint: existing.fingerprint },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
