"use server";

import { db, sshKeys } from "@groffee/db";
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

export async function getSSHKeys() {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const keys = await db
    .select({
      id: sshKeys.id,
      title: sshKeys.title,
      fingerprint: sshKeys.fingerprint,
      createdAt: sshKeys.createdAt,
    })
    .from(sshKeys)
    .where(eq(sshKeys.userId, user.id));

  const serializedKeys = keys.map((k) => ({
    ...k,
    createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : k.createdAt,
  }));

  return { keys: serializedKeys };
}

export async function addSSHKey(title: string, publicKey: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  if (!title || !publicKey) return { error: "Title and public key are required" };

  const trimmedKey = publicKey.trim();
  const fingerprint = generateFingerprint(trimmedKey);
  if (!fingerprint) return { error: "Invalid SSH public key format" };

  const [existing] = await db
    .select()
    .from(sshKeys)
    .where(eq(sshKeys.fingerprint, fingerprint))
    .limit(1);

  if (existing) return { error: "This SSH key is already registered" };

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(sshKeys).values({
    id,
    userId: user.id,
    title: title.trim(),
    publicKey: trimmedKey,
    fingerprint,
    createdAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "ssh_key.add",
    targetType: "ssh_key",
    targetId: id,
    metadata: { title: title.trim(), fingerprint },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { key: { id, title: title.trim(), fingerprint, createdAt: now.toISOString() } };
}

export async function deleteSSHKey(keyId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const [key] = await db
    .select()
    .from(sshKeys)
    .where(and(eq(sshKeys.id, keyId), eq(sshKeys.userId, user.id)))
    .limit(1);

  if (!key) return { error: "SSH key not found" };

  await db.delete(sshKeys).where(eq(sshKeys.id, keyId));

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "ssh_key.delete",
    targetType: "ssh_key",
    targetId: keyId,
    metadata: { title: key.title },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
