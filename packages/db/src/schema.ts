import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// --- Users ---
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// --- SSH Keys ---
export const sshKeys = sqliteTable("ssh_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// --- Sessions ---
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// --- Repositories ---
export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    defaultBranch: text("default_branch").notNull().default("main"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    diskPath: text("disk_path").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("repo_owner_name_idx").on(table.ownerId, table.name)],
);

// --- Repository Collaborators ---
export const repoCollaborators = sqliteTable(
  "repo_collaborators",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission", { enum: ["read", "write", "admin"] })
      .notNull()
      .default("write"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("collab_repo_user_idx").on(table.repoId, table.userId)],
);

// --- Pull Requests ---
export const pullRequests = sqliteTable("pull_requests", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  repoId: text("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  sourceBranch: text("source_branch").notNull(),
  targetBranch: text("target_branch").notNull(),
  status: text("status", { enum: ["open", "closed", "merged"] })
    .notNull()
    .default("open"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  mergedAt: integer("merged_at", { mode: "timestamp" }),
  mergedById: text("merged_by_id").references(() => users.id),
});

// --- Issues ---
export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  repoId: text("repo_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["open", "closed"] })
    .notNull()
    .default("open"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

// --- Comments (shared between PRs and Issues) ---
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
    onDelete: "cascade",
  }),
  issueId: text("issue_id").references(() => issues.id, {
    onDelete: "cascade",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// --- Edit History ---
export const editHistory = sqliteTable("edit_history", {
  id: text("id").primaryKey(),
  issueId: text("issue_id").references(() => issues.id, { onDelete: "cascade" }),
  pullRequestId: text("pull_request_id").references(() => pullRequests.id, { onDelete: "cascade" }),
  commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["issue", "pull_request", "comment"] }).notNull(),
  previousTitle: text("previous_title"),
  previousBody: text("previous_body"),
  editedById: text("edited_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// =====================================================
// Git Content Index Tables
// =====================================================

// --- Git Refs (branches/tags per repo) ---
export const gitRefs = sqliteTable(
  "git_refs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["branch", "tag"] }).notNull(),
    commitOid: text("commit_oid").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("git_refs_repo_name_idx").on(table.repoId, table.name)],
);

// --- Git Commits (deduplicated by OID per repo) ---
export const gitCommits = sqliteTable(
  "git_commits",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    oid: text("oid").notNull(),
    message: text("message").notNull(),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email").notNull(),
    authorTimestamp: integer("author_timestamp").notNull(),
    committerName: text("committer_name").notNull(),
    committerEmail: text("committer_email").notNull(),
    committerTimestamp: integer("committer_timestamp").notNull(),
    parentOids: text("parent_oids").notNull().default("[]"),
    treeOid: text("tree_oid").notNull(),
  },
  (table) => [uniqueIndex("git_commits_repo_oid_idx").on(table.repoId, table.oid)],
);

// --- Git Commit Ancestry (which commits belong to which ref, with depth) ---
export const gitCommitAncestry = sqliteTable(
  "git_commit_ancestry",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    refName: text("ref_name").notNull(),
    commitOid: text("commit_oid").notNull(),
    depth: integer("depth").notNull(),
  },
  (table) => [
    uniqueIndex("git_ancestry_repo_ref_commit_idx").on(table.repoId, table.refName, table.commitOid),
    index("git_ancestry_repo_ref_depth_idx").on(table.repoId, table.refName, table.depth),
  ],
);

// --- Git Tree Entries (flattened directory listings keyed by root tree OID) ---
export const gitTreeEntries = sqliteTable(
  "git_tree_entries",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    rootTreeOid: text("root_tree_oid").notNull(),
    parentPath: text("parent_path").notNull(),
    entryName: text("entry_name").notNull(),
    entryPath: text("entry_path").notNull(),
    entryType: text("entry_type", { enum: ["blob", "tree"] }).notNull(),
    entryOid: text("entry_oid").notNull(),
    entrySize: integer("entry_size"),
  },
  (table) => [
    uniqueIndex("git_tree_entry_tree_path_idx").on(table.repoId, table.rootTreeOid, table.entryPath),
    index("git_tree_entry_listing_idx").on(table.repoId, table.rootTreeOid, table.parentPath),
  ],
);

// --- Git Blobs (file content, deduplicated by OID per repo) ---
export const gitBlobs = sqliteTable(
  "git_blobs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    oid: text("oid").notNull(),
    content: text("content"),
    size: integer("size").notNull(),
    isBinary: integer("is_binary", { mode: "boolean" }).notNull().default(false),
    isTruncated: integer("is_truncated", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("git_blobs_repo_oid_idx").on(table.repoId, table.oid)],
);

// --- Git Commit Files (which files each commit touched) ---
export const gitCommitFiles = sqliteTable(
  "git_commit_files",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    commitOid: text("commit_oid").notNull(),
    filePath: text("file_path").notNull(),
    changeType: text("change_type", { enum: ["add", "modify", "delete", "rename"] }).notNull(),
  },
  (table) => [
    uniqueIndex("git_commit_files_repo_commit_path_idx").on(table.repoId, table.commitOid, table.filePath),
    index("git_commit_files_repo_path_idx").on(table.repoId, table.filePath),
  ],
);

// =====================================================
// Audit Logs
// =====================================================

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: text("metadata"),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("audit_logs_user_idx").on(table.userId),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

// =====================================================
// Personal Access Tokens
// =====================================================

export const personalAccessTokens = sqliteTable(
  "personal_access_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    scopes: text("scopes").notNull().default('["repo","user"]'),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("pat_user_idx").on(table.userId),
    uniqueIndex("pat_hash_idx").on(table.tokenHash),
  ],
);
