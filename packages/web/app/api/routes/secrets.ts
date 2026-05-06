import { Hono } from "hono";
import { db, repositories, users, repoSecrets } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import { canPush } from "../lib/permissions.js";
import { encryptSecret } from "../lib/secret-crypto.js";

export const secretRoutes = new Hono();

const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;
const MAX_SECRET_VALUE_BYTES = 64 * 1024;

function validateName(name: unknown): string | null {
  if (!name || typeof name !== "string") return "name is required";
  if (name.length > 64) return "name must be 64 characters or fewer";
  if (!SECRET_NAME_REGEX.test(name)) return "name must match /^[A-Z][A-Z0-9_]*$/";
  return null;
}

function validateValue(value: unknown): string | null {
  if (typeof value !== "string") return "value must be a string";
  if (value.length === 0) return "value cannot be empty";
  if (Buffer.byteLength(value, "utf-8") > MAX_SECRET_VALUE_BYTES) {
    return `value must be smaller than ${MAX_SECRET_VALUE_BYTES} bytes`;
  }
  return null;
}

/**
 * Resolve the repo and gate to write/admin. Listing also requires write so
 * that a read-only collaborator can't enumerate secret names.
 */
async function findRepoForSecrets(ownerName: string, repoName: string, userId: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return null;
  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return null;
  const allowed = await canPush(userId, repo.id);
  if (!allowed) return null;
  return { repo, owner };
}

// List all secret names + metadata for this repo (no ciphertext, no plaintext)
secretRoutes.get("/:owner/:repo/secrets", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForSecrets(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const rows = await db
    .select({
      id: repoSecrets.id,
      name: repoSecrets.name,
      createdById: repoSecrets.createdById,
      createdAt: repoSecrets.createdAt,
      updatedAt: repoSecrets.updatedAt,
      lastUsedAt: repoSecrets.lastUsedAt,
    })
    .from(repoSecrets)
    .where(eq(repoSecrets.repoId, result.repo.id));

  return c.json({
    secrets: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdById: r.createdById,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      lastUsedAt:
        r.lastUsedAt instanceof Date ? r.lastUsedAt.toISOString() : (r.lastUsedAt ?? null),
    })),
  });
});

// Create a new secret
secretRoutes.post("/:owner/:repo/secrets", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForSecrets(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    value?: string;
  } | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const nameErr = validateName(body.name);
  if (nameErr) return c.json({ error: nameErr }, 400);
  const valueErr = validateValue(body.value);
  if (valueErr) return c.json({ error: valueErr }, 400);

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, result.repo.id), eq(repoSecrets.name, body.name!)))
    .limit(1);
  if (existing) {
    return c.json({ error: `Secret "${body.name}" already exists` }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const ciphertext = encryptSecret(body.value!);

  await db.insert(repoSecrets).values({
    id,
    repoId: result.repo.id,
    name: body.name!,
    ciphertext,
    createdById: user.id,
    createdAt: now,
    updatedAt: now,
  });

  logAudit({
    userId: user.id,
    action: "secret.create",
    targetType: "repo_secret",
    targetId: id,
    // Name only — never log the value.
    metadata: { name: body.name, repoName: result.repo.name },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    secret: {
      id,
      name: body.name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
});

// Rotate (update value) of an existing secret
secretRoutes.put("/:owner/:repo/secrets/:name", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForSecrets(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const name = c.req.param("name");
  const nameErr = validateName(name);
  if (nameErr) return c.json({ error: nameErr }, 400);

  const body = (await c.req.json().catch(() => null)) as { value?: string } | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  const valueErr = validateValue(body.value);
  if (valueErr) return c.json({ error: valueErr }, 400);

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, result.repo.id), eq(repoSecrets.name, name)))
    .limit(1);
  if (!existing) return c.json({ error: `Secret "${name}" does not exist` }, 404);

  const now = new Date();
  await db
    .update(repoSecrets)
    .set({ ciphertext: encryptSecret(body.value!), updatedAt: now })
    .where(eq(repoSecrets.id, existing.id));

  logAudit({
    userId: user.id,
    action: "secret.update",
    targetType: "repo_secret",
    targetId: existing.id,
    metadata: { name, repoName: result.repo.name },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ updated: true, name, updatedAt: now.toISOString() });
});

// Delete a secret
secretRoutes.delete("/:owner/:repo/secrets/:name", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForSecrets(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const name = c.req.param("name");
  const nameErr = validateName(name);
  if (nameErr) return c.json({ error: nameErr }, 400);

  const [existing] = await db
    .select({ id: repoSecrets.id })
    .from(repoSecrets)
    .where(and(eq(repoSecrets.repoId, result.repo.id), eq(repoSecrets.name, name)))
    .limit(1);
  if (!existing) return c.json({ error: `Secret "${name}" does not exist` }, 404);

  await db.delete(repoSecrets).where(eq(repoSecrets.id, existing.id));

  logAudit({
    userId: user.id,
    action: "secret.delete",
    targetType: "repo_secret",
    targetId: existing.id,
    metadata: { name, repoName: result.repo.name },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});
