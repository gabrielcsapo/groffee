import { Hono } from "hono";
import { db, sshKeys } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { generateFingerprint } from "../lib/ssh.js";
import type { AppEnv } from "../types.js";
import { logAudit, getClientIp } from "../lib/audit.js";

export const sshKeyRoutes = new Hono<AppEnv>();

sshKeyRoutes.use("*", requireAuth);

// List user's SSH keys
sshKeyRoutes.get("/", async (c) => {
  const user = c.get("user");
  const keys = await db
    .select({
      id: sshKeys.id,
      title: sshKeys.title,
      fingerprint: sshKeys.fingerprint,
      createdAt: sshKeys.createdAt,
    })
    .from(sshKeys)
    .where(eq(sshKeys.userId, user.id));

  return c.json({ keys });
});

// Add a new SSH key
sshKeyRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { title, publicKey } = await c.req.json();

  if (!title || !publicKey) {
    return c.json({ error: "Title and public key are required" }, 400);
  }

  const trimmedKey = publicKey.trim();
  const fingerprint = generateFingerprint(trimmedKey);
  if (!fingerprint) {
    return c.json({ error: "Invalid SSH public key format" }, 400);
  }

  const [existing] = await db
    .select()
    .from(sshKeys)
    .where(eq(sshKeys.fingerprint, fingerprint))
    .limit(1);

  if (existing) {
    return c.json({ error: "This SSH key is already registered" }, 409);
  }

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

  logAudit({
    userId: user.id,
    action: "ssh_key.add",
    targetType: "ssh_key",
    targetId: id,
    metadata: { title: title.trim(), fingerprint },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ key: { id, title: title.trim(), fingerprint, createdAt: now } });
});

// Delete a specific key
sshKeyRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id");

  const [key] = await db
    .select()
    .from(sshKeys)
    .where(and(eq(sshKeys.id, keyId), eq(sshKeys.userId, user.id)))
    .limit(1);

  if (!key) {
    return c.json({ error: "SSH key not found" }, 404);
  }

  await db.delete(sshKeys).where(eq(sshKeys.id, keyId));

  logAudit({
    userId: user.id,
    action: "ssh_key.delete",
    targetType: "ssh_key",
    targetId: keyId,
    metadata: { title: key.title },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});
