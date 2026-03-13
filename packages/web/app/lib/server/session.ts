import { createHash } from "node:crypto";
import { db, sessions, users } from "@groffee/db";
import { eq, and, gt } from "drizzle-orm";
import { getRequest } from "./request-context";

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Request-scoped cache: memoize session lookup per request to avoid redundant DB queries.
// Uses a WeakMap keyed by the Request object so entries are GC'd when the request ends.
const sessionCache = new WeakMap<Request, Promise<Awaited<ReturnType<typeof _getSessionUser>>>>();

async function _getSessionUser() {
  const req = getRequest();
  if (!req) return null;

  const cookieHeader = req.headers.get("Cookie") || "";
  const token = parseCookie(cookieHeader, "session");
  if (!token) return null;

  const tokenHash = hashToken(token);

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function getSessionUser() {
  const req = getRequest();
  if (!req) return _getSessionUser();

  let cached = sessionCache.get(req);
  if (!cached) {
    cached = _getSessionUser();
    sessionCache.set(req, cached);
  }
  return cached;
}
