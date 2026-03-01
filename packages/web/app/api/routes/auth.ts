import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { db, users } from "@groffee/db";
import { eq, count } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createSession, validateSession, deleteSession } from "../lib/session.js";
import { logAudit, getClientIp } from "../lib/audit.js";

export const authRoutes = new Hono();

function isSecureRequest(c: { req: { raw: Request } }): boolean {
  const req = c.req.raw;
  return req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
}

authRoutes.post("/register", async (c) => {
  const { username, email, password } = await c.req.json();

  if (!username || !email || !password) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  // Check if username or email already exists
  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const [existingEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existingEmail) {
    return c.json({ error: "Email already registered" }, 409);
  }

  // First registered user becomes admin automatically
  const [{ userCount }] = await db.select({ userCount: count() }).from(users);
  const isFirstUser = userCount === 0;

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    username,
    email,
    passwordHash,
    isAdmin: isFirstUser,
    createdAt: now,
    updatedAt: now,
  });

  const session = await createSession(id);

  setCookie(c, "session", session.token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: session.expiresAt,
    secure: isSecureRequest(c),
  });

  logAudit({
    userId: id,
    action: "auth.register",
    targetType: "user",
    targetId: id,
    metadata: { username },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    user: { id, username, email },
  });
});

authRoutes.post("/login", async (c) => {
  const { username, password } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const session = await createSession(user.id);

  setCookie(c, "session", session.token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires: session.expiresAt,
    secure: isSecureRequest(c),
  });

  logAudit({
    userId: user.id,
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({
    user: { id: user.id, username: user.username, email: user.email },
  });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, "session");
  if (token) {
    await deleteSession(token);
  }

  setCookie(c, "session", "", {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });

  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ user: null });

  const session = await validateSession(token);
  if (!session) return c.json({ user: null });

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return c.json({ user: user ?? null });
});
