import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  (table) => [
    uniqueIndex("repo_owner_name_idx").on(table.ownerId, table.name),
  ],
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
