import { createHash, randomBytes } from "node:crypto";
import { db, sessions } from "@groffee/db";
import { eq, and, gt } from "drizzle-orm";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token: null,
    tokenHash,
    expiresAt,
    createdAt: now,
  });

  return { token, expiresAt };
}

export async function validateSession(token: string) {
  const tokenHash = hashToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return session ?? null;
}

export async function deleteSession(token: string) {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
