"use server";

import { db, users, repositories, sessions, systemLogs } from "@groffee/db";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { getSessionUser } from "./session";

const startTime = Date.now();

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    throw new Error("Admin access required");
  }
  return user;
}

export async function getAdminDashboard() {
  await requireAdmin();

  const [userCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(users);
  const [repoCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(repositories);
  const [sessionCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(sessions);
  const [logCount] = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(systemLogs);

  const memUsage = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;

  return {
    users: userCount.count,
    repos: repoCount.count,
    sessions: sessionCount.count,
    logs: logCount.count,
    uptime: uptimeMs,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
  };
}

export async function getSystemLogs(filters?: {
  level?: string;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  await requireAdmin();

  const limit = Math.min(filters?.limit || 50, 200);
  const offset = filters?.offset || 0;

  const conditions = [];
  if (filters?.level) conditions.push(eq(systemLogs.level, filters.level as "debug" | "info" | "warn" | "error"));
  if (filters?.source) conditions.push(eq(systemLogs.source, filters.source));
  if (filters?.search) conditions.push(like(systemLogs.message, `%${filters.search}%`));

  const logs = await db
    .select()
    .from(systemLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(systemLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(systemLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return { logs, total: total.count, limit, offset };
}

export async function getAdminUsers() {
  await requireAdmin();

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return allUsers;
}

export async function toggleUserAdmin(userId: string, isAdmin: boolean) {
  const currentUser = await requireAdmin();

  // Prevent self-demotion
  if (userId === currentUser.id && !isAdmin) {
    throw new Error("Cannot remove your own admin access");
  }

  await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  return { ok: true };
}
