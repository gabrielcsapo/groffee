import { beforeEach } from "vitest";
import { db } from "@groffee/db";
import { sql } from "drizzle-orm";
import { rmSync, mkdirSync } from "node:fs";

const DATA_DIR = process.env.DATA_DIR!;

// Create all tables (idempotent)
db.run(sql`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  is_public INTEGER NOT NULL DEFAULT 1,
  disk_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS repo_owner_name_idx ON repositories(owner_id, name)`);

db.run(sql`CREATE TABLE IF NOT EXISTS repo_collaborators (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'write',
  created_at INTEGER NOT NULL
)`);

db.run(
  sql`CREATE UNIQUE INDEX IF NOT EXISTS collab_repo_user_idx ON repo_collaborators(repo_id, user_id)`,
);

db.run(sql`CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  author_id TEXT NOT NULL REFERENCES users(id),
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  merged_at INTEGER,
  merged_by_id TEXT REFERENCES users(id)
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  repo_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  author_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  pull_request_id TEXT REFERENCES pull_requests(id) ON DELETE CASCADE,
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '["repo","user"]',
  expires_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
)`);
db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS pat_hash_idx ON personal_access_tokens(token_hash)`);

// Clean all data before each test
beforeEach(() => {
  db.run(sql`DELETE FROM audit_logs`);
  db.run(sql`DELETE FROM personal_access_tokens`);
  db.run(sql`DELETE FROM comments`);
  db.run(sql`DELETE FROM pull_requests`);
  db.run(sql`DELETE FROM issues`);
  db.run(sql`DELETE FROM repo_collaborators`);
  db.run(sql`DELETE FROM repositories`);
  db.run(sql`DELETE FROM sessions`);
  db.run(sql`DELETE FROM ssh_keys`);
  db.run(sql`DELETE FROM users`);

  // Reset test repo directory
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
});
