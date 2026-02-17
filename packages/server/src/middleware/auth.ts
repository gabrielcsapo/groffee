import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { validateSession } from "../lib/session.js";
import { db, users, personalAccessTokens } from "@groffee/db";
import { eq, and, gt, isNull, or } from "drizzle-orm";
import type { AppEnv } from "../types.js";

/**
 * Try to authenticate via Bearer token (PAT).
 * Returns the user if valid, null otherwise.
 */
async function authenticateBearer(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token.startsWith("groffee_")) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const [pat] = await db
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.tokenHash, tokenHash),
        or(isNull(personalAccessTokens.expiresAt), gt(personalAccessTokens.expiresAt, new Date())),
      ),
    )
    .limit(1);

  if (!pat) return null;

  const [user] = await db.select().from(users).where(eq(users.id, pat.userId)).limit(1);
  if (!user) return null;

  // Update lastUsedAt (fire-and-forget)
  db.update(personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(personalAccessTokens.id, pat.id))
    .catch(() => {});

  return user;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  // Try Bearer token first (for API clients)
  const bearerUser = await authenticateBearer(c.req.header("Authorization"));
  if (bearerUser) {
    c.set("user", bearerUser);
    await next();
    return;
  }

  // Fall back to session cookie
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const session = await validateSession(token);
  if (!session) return c.json({ error: "Session expired" }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

  if (!user) return c.json({ error: "User not found" }, 401);

  c.set("user", user);
  c.set("session", session);
  await next();
});

export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  // Try Bearer token first
  const bearerUser = await authenticateBearer(c.req.header("Authorization"));
  if (bearerUser) {
    c.set("user", bearerUser);
    await next();
    return;
  }

  // Fall back to session cookie
  const token = getCookie(c, "session");
  if (token) {
    const session = await validateSession(token);
    if (session) {
      const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
      if (user) {
        c.set("user", user);
      }
    }
  }
  await next();
});
