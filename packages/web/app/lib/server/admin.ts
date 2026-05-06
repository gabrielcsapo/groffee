"use server";

import { db, users, repositories, sessions, systemLogs, auditLogs, gitRefs } from "@groffee/db";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { existsSync, statSync } from "node:fs";
import { stat, readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { getSessionUser } from "./session";

const startTime = Date.now();

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    throw new Error("Admin access required");
  }
  return user;
}

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = process.env.DATA_DIR || resolve(PROJECT_ROOT, "data");
const ARTIFACTS_DIR = resolve(DATA_DIR, "pipeline-artifacts");
const DB_PATH = process.env.DATABASE_URL || resolve(DATA_DIR, "groffee.sqlite");

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // skip
      }
    }
  }
  return total;
}

export async function getAdminDashboard() {
  await requireAdmin();

  const [userCount] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(users);
  const [repoCount] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(repositories);
  const [sessionCount] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(sessions);
  const [logCount] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(systemLogs);

  const memUsage = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;

  // SQLite DB size — best read straight off the file rather than via
  // `PRAGMA page_count * page_size` so we also count the WAL sidecar that
  // sqlite uses with our journal_mode=WAL setting.
  let dbSizeBytes = 0;
  try {
    if (existsSync(DB_PATH)) {
      dbSizeBytes += statSync(DB_PATH).size;
      const walPath = `${DB_PATH}-wal`;
      if (existsSync(walPath)) dbSizeBytes += statSync(walPath).size;
    }
  } catch {
    // best effort
  }

  // Pipeline artifacts size (sum of on-disk dir).
  const artifactsSizeBytes = await dirSize(ARTIFACTS_DIR);

  // Top 20 repos by stored disk usage (computed by the CLI). Only show repos
  // that have actually been measured.
  const storageRows = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      ownerId: repositories.ownerId,
      diskUsageBytes: repositories.diskUsageBytes,
    })
    .from(repositories)
    .orderBy(desc(repositories.diskUsageBytes))
    .limit(20);

  // Resolve owner names in batch
  const ownerIds = [...new Set(storageRows.map((r) => r.ownerId))];
  const ownerRows =
    ownerIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(sql`${users.id} IN ${ownerIds}`)
      : [];
  const ownerMap = new Map(ownerRows.map((u) => [u.id, u.username]));

  const storage = storageRows.map((r) => ({
    id: r.id,
    name: r.name,
    owner: ownerMap.get(r.ownerId) || "unknown",
    diskUsageBytes: r.diskUsageBytes ?? null,
  }));

  // Search index freshness — find the most recent successful reindex and
  // count repos whose HEAD ref is newer than their last_indexed_at.
  const [latestIndexed] = await db
    .select({ ts: sql<number>`cast(max(${repositories.lastIndexedAt}) as integer)` })
    .from(repositories);

  // "Pending reindex" = the repo has at least one git ref whose
  // updated_at is newer than its last_indexed_at, OR last_indexed_at is null
  // and the repo has any indexed refs.
  const pendingRows = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(gitRefs, eq(gitRefs.repoId, repositories.id))
    .where(
      sql`(${repositories.lastIndexedAt} IS NULL OR ${gitRefs.updatedAt} > ${repositories.lastIndexedAt})`,
    )
    .groupBy(repositories.id);

  // Recent audit events
  const audit = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      username: users.username,
      userId: auditLogs.userId,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

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
    dbSizeBytes,
    artifactsSizeBytes,
    storage,
    searchIndex: {
      lastReindexAt:
        latestIndexed?.ts != null ? new Date(latestIndexed.ts * 1000).toISOString() : null,
      pendingCount: pendingRows.length,
    },
    auditEvents: audit.map((a) => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    })),
  };
}

export async function backfillPullRequests(repoId?: string | null) {
  const adminUser = await requireAdmin();
  const { backfillPullRequestsForAllRepos, backfillPullRequestsForRepo } =
    await import("../../api/lib/pr-backfill");

  let summaries;
  if (repoId) {
    const summary = await backfillPullRequestsForRepo(repoId);
    summaries = [summary];
  } else {
    summaries = await backfillPullRequestsForAllRepos();
  }

  // Audit-log the action as the admin who triggered it. Aggregate stats
  // give later reviewers a sense of scope without dumping every row.
  const totalInserted = summaries.reduce((s, x) => s + x.inserted, 0);
  const totalSkipped = summaries.reduce((s, x) => s + x.skipped, 0);
  await db
    .insert(auditLogs)
    .values({
      id: crypto.randomUUID(),
      userId: adminUser.id,
      action: "admin.pr_backfill",
      targetType: "system",
      targetId: repoId || "all",
      metadata: JSON.stringify({
        repos: summaries.length,
        inserted: totalInserted,
        skipped: totalSkipped,
      }),
      ipAddress: null,
      createdAt: new Date(),
    })
    .catch(() => {});

  return { summaries };
}

export async function getAdminAuditLog(opts: {
  cursor?: string | null;
  limit?: number;
  action?: string;
  username?: string;
  ip?: string;
}) {
  await requireAdmin();
  const limit = Math.min(opts.limit || 50, 200);
  // Cursor is the createdAt epoch ms of the last seen row.
  const cursorTs = opts.cursor ? parseInt(opts.cursor, 10) : null;
  const conditions = [] as ReturnType<typeof eq>[];
  if (opts.action) conditions.push(like(auditLogs.action, `%${opts.action}%`));
  if (opts.ip) conditions.push(like(auditLogs.ipAddress, `%${opts.ip}%`));

  let userFilter: string | null = null;
  if (opts.username) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, opts.username))
      .limit(1);
    userFilter = u?.id ?? "__none__"; // sentinel that matches nothing
  }
  if (userFilter) conditions.push(eq(auditLogs.userId, userFilter));

  if (cursorTs != null) {
    conditions.push(sql`cast(${auditLogs.createdAt} as integer) < ${Math.floor(cursorTs / 1000)}`);
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      ipAddress: auditLogs.ipAddress,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      username: users.username,
      userId: auditLogs.userId,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const nextCursor = hasMore
    ? String(
        pageRows[pageRows.length - 1].createdAt instanceof Date
          ? (pageRows[pageRows.length - 1].createdAt as Date).getTime()
          : pageRows[pageRows.length - 1].createdAt,
      )
    : null;

  return {
    events: pageRows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    nextCursor,
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
  if (filters?.level)
    conditions.push(eq(systemLogs.level, filters.level as "debug" | "info" | "warn" | "error"));
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
