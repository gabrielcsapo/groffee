import { Hono } from "hono";
import { randomBytes, createHash } from "node:crypto";
import { db, personalAccessTokens } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import type { AppEnv } from "../types.js";

export const tokenRoutes = new Hono<AppEnv>();

tokenRoutes.use("*", requireAuth);

const VALID_SCOPES = ["repo", "read:repo", "user", "audit"];

function generateToken(): string {
  return "groffee_" + randomBytes(20).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// List user's tokens (no sensitive data)
tokenRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tokens = await db
    .select({
      id: personalAccessTokens.id,
      name: personalAccessTokens.name,
      tokenPrefix: personalAccessTokens.tokenPrefix,
      scopes: personalAccessTokens.scopes,
      expiresAt: personalAccessTokens.expiresAt,
      lastUsedAt: personalAccessTokens.lastUsedAt,
      createdAt: personalAccessTokens.createdAt,
    })
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, user.id));

  return c.json({ tokens });
});

// Create a new token — returns plaintext ONCE
tokenRoutes.post("/", async (c) => {
  const user = c.get("user");
  const { name, scopes, expiresAt } = await c.req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "Token name is required" }, 400);
  }

  // Validate scopes
  const scopeList: string[] = Array.isArray(scopes) ? scopes : ["repo", "user"];
  for (const scope of scopeList) {
    if (!VALID_SCOPES.includes(scope)) {
      return c.json({ error: `Invalid scope: ${scope}` }, 400);
    }
  }

  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);
  const tokenPrefix = plainToken.slice(0, 16); // "groffee_" + 8 hex chars

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(personalAccessTokens).values({
    id,
    userId: user.id,
    name: name.trim(),
    tokenHash,
    tokenPrefix,
    scopes: JSON.stringify(scopeList),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    lastUsedAt: null,
    createdAt: now,
  });

  logAudit({
    userId: user.id,
    action: "token.create",
    targetType: "token",
    targetId: id,
    metadata: { name: name.trim(), scopes: scopeList },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    token: {
      id,
      name: name.trim(),
      tokenPrefix,
      scopes: scopeList,
      expiresAt: expiresAt || null,
      createdAt: now,
    },
    plainToken, // Only returned once!
  });
});

// Revoke a token
tokenRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const tokenId = c.req.param("id");

  const [token] = await db
    .select()
    .from(personalAccessTokens)
    .where(and(eq(personalAccessTokens.id, tokenId), eq(personalAccessTokens.userId, user.id)))
    .limit(1);

  if (!token) {
    return c.json({ error: "Token not found" }, 404);
  }

  await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, tokenId));

  logAudit({
    userId: user.id,
    action: "token.revoke",
    targetType: "token",
    targetId: tokenId,
    metadata: { name: token.name },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});
