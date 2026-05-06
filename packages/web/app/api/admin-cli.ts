/**
 * Groffee admin CLI
 *
 * One entry point with subcommands:
 *   reset-password <username> <new-password>
 *   make-admin <username>
 *   disable-user <username> [--enable]
 *   recompute-storage
 *   reindex-search [<owner/repo>]
 *
 * Run via:
 *   pnpm --filter @groffee/web admin <subcommand> [...args]
 *   # or
 *   pnpm groffee admin <subcommand> [...args]
 *
 * Every action writes an audit log entry under `admin.cli.<subcommand>` so
 * later forensic review can tell whether a privileged change came from the
 * web UI or the host shell. The CLI uses the audit user "system" — it tries
 * to find a user named "system" and falls back to the first admin user; if
 * neither exists the action runs but no audit row is written.
 */

import { db, users, repositories, auditLogs } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";

function findProjectRoot(): string {
  // We can't import paths.js here because that file imports app code; do a
  // local copy of the same lookup.
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = process.env.DATA_DIR || resolve(PROJECT_ROOT, "data");
const REPOS_DIR = resolve(DATA_DIR, "repositories");

function usage(): never {
  console.error(`Groffee admin CLI

Usage:
  pnpm --filter @groffee/web admin <subcommand> [args]

Subcommands:
  reset-password <username> <new-password>   Hash and replace the user's password
  make-admin <username>                      Promote a user to admin
  disable-user <username> [--enable]         Disable (or re-enable) a user account
  recompute-storage                          Walk data/repositories and refresh diskUsageBytes
  reindex-search [<owner/repo>]              Drop & rebuild FTS index for one or all repos
`);
  process.exit(1);
}

async function resolveAuditUserId(): Promise<string | null> {
  const [systemUser] = await db.select().from(users).where(eq(users.username, "system")).limit(1);
  if (systemUser) return systemUser.id;
  const [anyAdmin] = await db.select().from(users).where(eq(users.isAdmin, true)).limit(1);
  return anyAdmin?.id ?? null;
}

async function audit(action: string, targetType: string, targetId: string, metadata?: object) {
  const userId = await resolveAuditUserId();
  if (!userId) return; // No user to attribute the action to — skip rather than crash.
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    userId,
    action,
    targetType,
    targetId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    ipAddress: "cli",
    createdAt: new Date(),
  });
}

async function cmdResetPassword(args: string[]) {
  const [username, newPassword] = args;
  if (!username || !newPassword) {
    console.error("Usage: reset-password <username> <new-password>");
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }
  const passwordHash = await hash(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit("admin.cli.reset_password", "user", user.id, { username });
  console.log(`Password reset for "${username}".`);
}

async function cmdMakeAdmin(args: string[]) {
  const [username] = args;
  if (!username) {
    console.error("Usage: make-admin <username>");
    process.exit(1);
  }
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }
  if (user.isAdmin) {
    console.log(`User "${username}" is already an admin.`);
    return;
  }
  await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
  await audit("admin.cli.make_admin", "user", user.id, { username });
  console.log(`User "${username}" is now an admin.`);
}

async function cmdDisableUser(args: string[]) {
  const enable = args.includes("--enable");
  const username = args.filter((a) => !a.startsWith("--"))[0];
  if (!username) {
    console.error("Usage: disable-user <username> [--enable]");
    process.exit(1);
  }
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }
  await db.update(users).set({ disabled: !enable }).where(eq(users.id, user.id));
  await audit(enable ? "admin.cli.enable_user" : "admin.cli.disable_user", "user", user.id, {
    username,
  });
  console.log(`User "${username}" ${enable ? "enabled" : "disabled"}.`);
}

/**
 * Sum size of every regular file under `dir`, recursively. Symlinks are not
 * followed (matches `du -sb` semantics on Linux). Errors per-entry are
 * skipped — we want a best-effort number, not a hard failure if one file
 * goes missing mid-walk.
 */
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
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // missing / unreadable — skip
      }
    }
  }
  return total;
}

async function cmdRecomputeStorage() {
  const allRepos = await db.select().from(repositories);
  let updated = 0;
  for (const repo of allRepos) {
    const repoPath = resolve(REPOS_DIR, repo.diskPath);
    if (!existsSync(repoPath)) {
      console.log(`  skip ${repo.diskPath} (missing on disk)`);
      continue;
    }
    const bytes = await dirSize(repoPath);
    await db
      .update(repositories)
      .set({ diskUsageBytes: bytes })
      .where(eq(repositories.id, repo.id));
    console.log(`  ${repo.diskPath}\t${bytes.toLocaleString()} bytes`);
    updated++;
  }
  await audit("admin.cli.recompute_storage", "system", "storage", { repos: updated });
  console.log(`\nUpdated ${updated} repos.`);
}

async function cmdReindexSearch(args: string[]) {
  // Lazy-import the indexer so we don't pull the world for the lighter
  // subcommands. The indexer transitively imports git helpers + activity
  // cache, which matter only for this one path.
  const { fullReindex } = await import("./lib/indexer.js");

  const target = args[0];
  const allRepos = await db.select().from(repositories);
  let repos: typeof allRepos = [];

  if (target) {
    const [ownerName, repoName] = target.split("/");
    if (!ownerName || !repoName) {
      console.error("Usage: reindex-search [<owner/repo>]");
      process.exit(1);
    }
    const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
    if (!owner) {
      console.error(`User "${ownerName}" not found.`);
      process.exit(1);
    }
    const [repo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
      .limit(1);
    if (!repo) {
      console.error(`Repository "${target}" not found.`);
      process.exit(1);
    }
    repos = [repo];
  } else {
    repos = allRepos;
  }

  for (const repo of repos) {
    const repoPath = resolve(REPOS_DIR, repo.diskPath);
    if (!existsSync(repoPath)) {
      console.log(`  skip ${repo.diskPath} (missing on disk)`);
      continue;
    }
    console.log(`  reindexing ${repo.diskPath} ...`);
    try {
      await fullReindex(repo.id, repoPath);
      await db
        .update(repositories)
        .set({ lastIndexedAt: new Date() })
        .where(eq(repositories.id, repo.id));
      console.log(`    done`);
    } catch (err) {
      console.error(`    failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  await audit("admin.cli.reindex_search", "system", "search", {
    target: target || "all",
    repos: repos.length,
  });
  console.log(`\nReindexed ${repos.length} repo(s).`);
}

async function main() {
  const [, , subcommand, ...rest] = process.argv;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") usage();

  switch (subcommand) {
    case "reset-password":
      await cmdResetPassword(rest);
      break;
    case "make-admin":
      await cmdMakeAdmin(rest);
      break;
    case "disable-user":
      await cmdDisableUser(rest);
      break;
    case "recompute-storage":
      await cmdRecomputeStorage();
      break;
    case "reindex-search":
      await cmdReindexSearch(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      usage();
  }

  // Ensure the SQLite handle is flushed and the process exits — drizzle keeps
  // the connection open which would otherwise dangle a tsx process forever.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
