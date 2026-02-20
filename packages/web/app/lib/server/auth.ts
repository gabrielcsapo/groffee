"use server";

import { db, users, sessions } from "@groffee/db";
import { eq, count } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import { getRequest } from "./request-context";
import { logAudit, getClientIp } from "./audit";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function serializeCookie(
  name: string,
  value: string,
  opts: { httpOnly?: boolean; sameSite?: string; path?: string; expires?: Date; maxAge?: number; secure?: boolean },
): string {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.httpOnly) cookie += "; HttpOnly";
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.expires) cookie += `; Expires=${opts.expires.toUTCString()}`;
  if (opts.maxAge !== undefined) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.secure) cookie += "; Secure";
  return cookie;
}

export async function login(
  username: string,
  password: string,
): Promise<{ user?: { id: string; username: string; email: string }; error?: string; setCookie?: string }> {
  if (!username || !password) return { error: "Missing required fields" };

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) return { error: "Invalid credentials" };

  const valid = await verify(user.passwordHash, password);
  if (!valid) return { error: "Invalid credentials" };

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    token: null,
    tokenHash,
    expiresAt,
    createdAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  const cookie = serializeCookie("session", token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });

  return {
    user: { id: user.id, username: user.username, email: user.email },
    setCookie: cookie,
  };
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<{ user?: { id: string; username: string; email: string }; error?: string; setCookie?: string }> {
  if (!username || !email || !password) return { error: "Missing required fields" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) return { error: "Username already taken" };

  const [existingEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingEmail) return { error: "Email already registered" };

  const passwordHash = await hash(password);
  const now = new Date();
  const id = crypto.randomUUID();

  // First registered user becomes admin automatically
  const [{ userCount }] = await db.select({ userCount: count() }).from(users);
  const isFirstUser = userCount === 0;

  await db.insert(users).values({
    id,
    username,
    email,
    passwordHash,
    isAdmin: isFirstUser,
    createdAt: now,
    updatedAt: now,
  });

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: id,
    token: null,
    tokenHash,
    expiresAt,
    createdAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: id,
    action: "auth.register",
    targetType: "user",
    targetId: id,
    metadata: { username },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  const cookie = serializeCookie("session", token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });

  return {
    user: { id, username, email },
    setCookie: cookie,
  };
}

export async function logout(): Promise<{ ok: boolean; setCookie?: string }> {
  const req = getRequest();
  if (req) {
    const cookieHeader = req.headers.get("Cookie") || "";
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]*)/);
    const token = match ? decodeURIComponent(match[1]) : null;

    if (token) {
      const tokenHash = hashToken(token);
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    }
  }

  const cookie = serializeCookie("session", "", {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });

  return { ok: true, setCookie: cookie };
}

export async function isFirstUser(): Promise<boolean> {
  const [{ userCount }] = await db.select({ userCount: count() }).from(users);
  return userCount === 0;
}

export { getSessionUser } from "./session";
