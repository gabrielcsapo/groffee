"use server";

import { randomBytes, createHash } from "node:crypto";
import { db, personalAccessTokens } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

const VALID_SCOPES = ["repo", "read:repo", "user", "audit"];

function generateToken(): string {
  return "groffee_" + randomBytes(20).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getTokens() {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

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

  const serializedTokens = tokens.map((t) => ({
    ...t,
    expiresAt: t.expiresAt instanceof Date ? t.expiresAt.toISOString() : t.expiresAt,
    lastUsedAt: t.lastUsedAt instanceof Date ? t.lastUsedAt.toISOString() : t.lastUsedAt,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  }));

  return { tokens: serializedTokens };
}

export async function createToken(
  name: string,
  scopes?: string[],
  expiresAt?: string,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { error: "Token name is required" };
  }

  const scopeList: string[] = Array.isArray(scopes) ? scopes : ["repo", "user"];
  for (const scope of scopeList) {
    if (!VALID_SCOPES.includes(scope)) {
      return { error: `Invalid scope: ${scope}` };
    }
  }

  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);
  const tokenPrefix = plainToken.slice(0, 16);

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

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "token.create",
    targetType: "token",
    targetId: id,
    metadata: { name: name.trim(), scopes: scopeList },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    token: {
      id,
      name: name.trim(),
      tokenPrefix,
      scopes: scopeList,
      expiresAt: expiresAt || null,
      createdAt: now.toISOString(),
    },
    plainToken,
  };
}

export async function revokeToken(tokenId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  const [token] = await db
    .select()
    .from(personalAccessTokens)
    .where(and(eq(personalAccessTokens.id, tokenId), eq(personalAccessTokens.userId, user.id)))
    .limit(1);

  if (!token) return { error: "Token not found" };

  await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, tokenId));

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "token.revoke",
    targetType: "token",
    targetId: tokenId,
    metadata: { name: token.name },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
