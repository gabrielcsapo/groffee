import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { validateSession } from "../lib/session.js";
import { db, users } from "@groffee/db";
import { eq } from "drizzle-orm";

export const requireAuth = createMiddleware(async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const session = await validateSession(token);
  if (!session) return c.json({ error: "Session expired" }, 401);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 401);

  c.set("user", user);
  c.set("session", session);
  await next();
});

export const optionalAuth = createMiddleware(async (c, next) => {
  const token = getCookie(c, "session");
  if (token) {
    const session = await validateSession(token);
    if (session) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (user) {
        c.set("user", user);
      }
    }
  }
  await next();
});
