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
export const sshKeys = sqliteTable(
  "ssh_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    publicKey: text("public_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("ssh_keys_user_id_idx").on(table.userId),
    index("ssh_keys_fingerprint_idx").on(table.fingerprint),
  ],
);

// --- Sessions ---
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token"),
    tokenHash: text("token_hash"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

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
    index("repos_public_updated_idx").on(table.isPublic, table.updatedAt),
  ],
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
  (table) => [
    uniqueIndex("collab_repo_user_idx").on(table.repoId, table.userId),
    index("collab_user_idx").on(table.userId),
  ],
);

// --- Pull Requests ---
export const pullRequests = sqliteTable(
  "pull_requests",
  {
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
  },
  (table) => [index("prs_repo_status_idx").on(table.repoId, table.status)],
);

// --- Issues ---
export const issues = sqliteTable(
  "issues",
  {
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
  },
  (table) => [index("issues_repo_status_idx").on(table.repoId, table.status)],
);

// --- Comments (shared between PRs and Issues) ---
export const comments = sqliteTable(
  "comments",
  {
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
  },
  (table) => [
    index("comments_issue_idx").on(table.issueId),
    index("comments_pr_idx").on(table.pullRequestId),
  ],
);

// --- Edit History ---
export const editHistory = sqliteTable(
  "edit_history",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
      onDelete: "cascade",
    }),
    commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["issue", "pull_request", "comment"] }).notNull(),
    previousTitle: text("previous_title"),
    previousBody: text("previous_body"),
    editedById: text("edited_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("edit_history_issue_idx").on(table.issueId),
    index("edit_history_pr_idx").on(table.pullRequestId),
    index("edit_history_comment_idx").on(table.commentId),
  ],
);

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
  (table) => [
    uniqueIndex("git_refs_repo_name_idx").on(table.repoId, table.name),
    index("git_refs_repo_updated_idx").on(table.repoId, table.updatedAt),
  ],
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
  (table) => [
    uniqueIndex("git_commits_repo_oid_idx").on(table.repoId, table.oid),
    index("git_commits_repo_author_ts_idx").on(table.repoId, table.authorTimestamp),
    index("git_commits_repo_author_email_idx").on(table.repoId, table.authorEmail),
  ],
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
    uniqueIndex("git_ancestry_repo_ref_commit_idx").on(
      table.repoId,
      table.refName,
      table.commitOid,
    ),
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
    uniqueIndex("git_tree_entry_tree_path_idx").on(
      table.repoId,
      table.rootTreeOid,
      table.entryPath,
    ),
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
    isLfs: integer("is_lfs", { mode: "boolean" }).notNull().default(false),
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
    uniqueIndex("git_commit_files_repo_commit_path_idx").on(
      table.repoId,
      table.commitOid,
      table.filePath,
    ),
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

// =====================================================
// Repository Activity Cache (materialized view pattern)
// =====================================================

export const repoActivityCache = sqliteTable(
  "repo_activity_cache",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    cacheKey: text("cache_key").notNull(),
    data: text("data").notNull(),
    authorFilter: text("author_filter"),
    computedAt: integer("computed_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("repo_activity_cache_key_idx").on(table.repoId, table.cacheKey, table.authorFilter),
    index("repo_activity_cache_repo_idx").on(table.repoId),
  ],
);

// =====================================================
// System Logs (structured logging)
// =====================================================

export const systemLogs = sqliteTable(
  "system_logs",
  {
    id: text("id").primaryKey(),
    level: text("level", { enum: ["debug", "info", "warn", "error"] }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"),
    requestId: text("request_id"),
    userId: text("user_id"),
    source: text("source"),
    duration: integer("duration"),
    method: text("method"),
    path: text("path"),
    statusCode: integer("status_code"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("system_logs_level_idx").on(table.level),
    index("system_logs_created_idx").on(table.createdAt),
    index("system_logs_request_idx").on(table.requestId),
    index("system_logs_source_idx").on(table.source),
  ],
);

// =====================================================
// CI/CD Pipeline Tables
// =====================================================

// --- Pipelines (cached YAML configs per repo+ref) ---
export const pipelines = sqliteTable(
  "pipelines",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    configYaml: text("config_yaml").notNull(),
    configHash: text("config_hash").notNull(),
    parsedConfig: text("parsed_config").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("pipelines_repo_ref_idx").on(table.repoId, table.ref),
    index("pipelines_repo_idx").on(table.repoId),
  ],
);

// --- Pipeline Runs (each execution of a pipeline) ---
export const pipelineRuns = sqliteTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    pipelineName: text("pipeline_name").notNull(),
    number: integer("number").notNull(),
    status: text("status", {
      enum: ["queued", "running", "success", "failure", "cancelled", "timed_out"],
    })
      .notNull()
      .default("queued"),
    trigger: text("trigger", {
      enum: ["push", "pull_request", "manual"],
    }).notNull(),
    ref: text("ref").notNull(),
    commitOid: text("commit_oid").notNull(),
    triggeredById: text("triggered_by_id")
      .notNull()
      .references(() => users.id),
    configSnapshot: text("config_snapshot").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("pipeline_runs_repo_idx").on(table.repoId),
    index("pipeline_runs_repo_status_idx").on(table.repoId, table.status),
    index("pipeline_runs_repo_number_idx").on(table.repoId, table.number),
  ],
);

// --- Pipeline Jobs (jobs within a run) ---
export const pipelineJobs = sqliteTable(
  "pipeline_jobs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["queued", "running", "success", "failure", "cancelled", "skipped", "timed_out"],
    })
      .notNull()
      .default("queued"),
    sortOrder: integer("sort_order").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("pipeline_jobs_run_idx").on(table.runId)],
);

// --- Pipeline Steps (steps within a job) ---
export const pipelineSteps = sqliteTable(
  "pipeline_steps",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => pipelineJobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    command: text("command"),
    uses: text("uses"),
    withConfig: text("with_config"),
    status: text("status", {
      enum: ["queued", "running", "success", "failure", "cancelled", "skipped"],
    })
      .notNull()
      .default("queued"),
    exitCode: integer("exit_code"),
    logPath: text("log_path"),
    sortOrder: integer("sort_order").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("pipeline_steps_job_idx").on(table.jobId)],
);

// --- Pipeline Artifacts (build artifacts) ---
export const pipelineArtifacts = sqliteTable(
  "pipeline_artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => pipelineJobs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    diskPath: text("disk_path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("pipeline_artifacts_run_idx").on(table.runId)],
);

// --- Pages Deployments ---
export const pagesDeployments = sqliteTable(
  "pages_deployments",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
    commitOid: text("commit_oid").notNull(),
    diskPath: text("disk_path").notNull(),
    status: text("status", {
      enum: ["active", "superseded", "failed"],
    })
      .notNull()
      .default("active"),
    deployedById: text("deployed_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("pages_deploy_repo_idx").on(table.repoId),
    index("pages_deploy_repo_status_idx").on(table.repoId, table.status),
  ],
);

// =====================================================
// LFS Objects
// =====================================================

export const lfsObjects = sqliteTable(
  "lfs_objects",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    oid: text("oid").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("lfs_objects_repo_oid_idx").on(table.repoId, table.oid),
    index("lfs_objects_repo_idx").on(table.repoId),
  ],
);
