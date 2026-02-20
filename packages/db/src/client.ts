import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const DB_PATH = process.env.DATABASE_URL || resolve(PROJECT_ROOT, "data", "groffee.sqlite");

mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

const MIGRATIONS_FOLDER = resolve(PROJECT_ROOT, "packages", "db", "migrations");
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

// One-time backfill: hash any existing plaintext session tokens
try {
  const { createHash } = await import("node:crypto");
  const rows = sqlite.prepare("SELECT id, token FROM sessions WHERE token IS NOT NULL AND token_hash IS NULL").all() as Array<{ id: string; token: string }>;
  if (rows.length > 0) {
    const stmt = sqlite.prepare("UPDATE sessions SET token_hash = ?, token = NULL WHERE id = ?");
    for (const row of rows) {
      const hash = createHash("sha256").update(row.token).digest("hex");
      stmt.run(hash, row.id);
    }
  }
} catch {
  // Non-fatal: backfill may fail if schema hasn't migrated yet
}

export type DB = typeof db;
