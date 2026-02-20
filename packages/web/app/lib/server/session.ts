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

export async function getSessionUser() {
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
