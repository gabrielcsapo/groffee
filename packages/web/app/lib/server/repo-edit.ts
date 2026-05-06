"use server";

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { db, repositories, users, repoCollaborators, pullRequests, issues } from "@groffee/db";
import { eq, and, max } from "drizzle-orm";
import { snapshotRefs } from "@groffee/git";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";
import { resolveDiskPath } from "../../api/lib/paths";
import { triggerIncrementalIndex } from "../../api/lib/indexer";

const execFileAsync = promisify(execFile);

/**
 * Run a git subprocess and pipe `input` to its stdin. `execFile` doesn't
 * accept stdin input, so we use spawn() and collect stdout. Used for
 * `hash-object --stdin`, `mktree`, and `commit-tree -F -`.
 */
function runGitWithInput(
  cwd: string,
  args: string[],
  input: string | Buffer,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
    child.stderr.on("data", (c) => stderrChunks.push(Buffer.from(c)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf8").trimEnd());
      } else {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(new Error(`git ${args[0]} exited with ${code}: ${stderr}`));
      }
    });
    child.stdin.end(input);
  });
}

const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PATH_LEN = 1024;

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

export type PathValidationError =
  | "empty"
  | "too_long"
  | "traversal"
  | "git_dir"
  | "absolute"
  | "trailing_slash";

export function validatePath(path: string): PathValidationError | null {
  if (!path || path.trim() === "") return "empty";
  if (path.length > MAX_PATH_LEN) return "too_long";
  if (path.startsWith("/")) return "absolute";
  if (path.endsWith("/")) return "trailing_slash";
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return "traversal";
    if (seg === ".git") return "git_dir";
  }
  return null;
}

function pathErrorMessage(err: PathValidationError): string {
  switch (err) {
    case "empty":
      return "Path cannot be empty.";
    case "too_long":
      return `Path is too long (max ${MAX_PATH_LEN} characters).`;
    case "traversal":
      return "Path contains invalid segments.";
    case "git_dir":
      return "Paths under .git are not allowed.";
    case "absolute":
      return "Path must be relative.";
    case "trailing_slash":
      return "Path cannot end with a slash.";
  }
}

// ---------------------------------------------------------------------------
// Repo + permission resolution
// ---------------------------------------------------------------------------

interface ResolvedRepo {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  diskPath: string;
  defaultBranch: string;
  editPolicy: "direct" | "pull_request";
}

interface ActorUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
}

type ResolveResult = { error: string } | { user: ActorUser; repo: ResolvedRepo };

async function resolveRepoAndUser(
  ownerName: string,
  repoName: string,
  actor?: ActorUser,
): Promise<ResolveResult> {
  let sessionUser: ActorUser | null = null;
  if (actor) {
    sessionUser = actor;
  } else {
    const u = await getSessionUser();
    if (u) {
      sessionUser = {
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
      };
    }
  }
  if (!sessionUser) return { error: "Unauthorized" as const };

  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" as const };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" as const };

  // Visibility: private repos require owner/collaborator
  if (!repo.isPublic && sessionUser.id !== owner.id) {
    const [collab] = await db
      .select()
      .from(repoCollaborators)
      .where(
        and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, sessionUser.id)),
      )
      .limit(1);
    if (!collab) return { error: "Repository not found" as const };
  }

  // Write permission: owner or collaborator with write/admin
  let canWrite = sessionUser.id === owner.id;
  if (!canWrite) {
    const [collab] = await db
      .select()
      .from(repoCollaborators)
      .where(
        and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, sessionUser.id)),
      )
      .limit(1);
    canWrite = !!collab && (collab.permission === "write" || collab.permission === "admin");
  }

  if (!canWrite) return { error: "Forbidden" as const };
  if (repo.isArchived) {
    return { error: "This repository is archived and is read-only." as const };
  }

  const resolved: ResolvedRepo = {
    id: repo.id,
    ownerId: repo.ownerId,
    ownerName: owner.username,
    name: repo.name,
    diskPath: resolveDiskPath(repo.diskPath),
    defaultBranch: repo.defaultBranch,
    editPolicy: repo.editPolicy as "direct" | "pull_request",
  };

  return { user: sessionUser, repo: resolved };
}

// ---------------------------------------------------------------------------
// Git plumbing helpers (execFile-based, async)
// ---------------------------------------------------------------------------

interface AuthorIdentity {
  name: string;
  email: string;
}

function authorEnv(author: AuthorIdentity): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  };
}

async function runGit(
  cwd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: opts.env || process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.toString().trimEnd();
}

async function hashObject(repoPath: string, content: string | Buffer): Promise<string> {
  return runGitWithInput(repoPath, ["hash-object", "-w", "--stdin"], content);
}

interface TreeEntry {
  mode: string;
  type: "blob" | "tree" | "commit";
  oid: string;
  name: string;
}

async function readTree(repoPath: string, treeIsh: string): Promise<TreeEntry[]> {
  let stdout: string;
  try {
    const out = await execFileAsync("git", ["ls-tree", treeIsh], {
      cwd: repoPath,
      maxBuffer: 64 * 1024 * 1024,
    });
    stdout = out.stdout.toString();
  } catch {
    return [];
  }
  const entries: TreeEntry[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx === -1) continue;
    const meta = line.slice(0, tabIdx);
    const name = line.slice(tabIdx + 1);
    const [mode, type, oid] = meta.split(" ");
    entries.push({ mode, type: type as TreeEntry["type"], oid, name });
  }
  return entries;
}

async function makeTree(repoPath: string, entries: TreeEntry[]): Promise<string> {
  if (entries.length === 0) {
    // Empty tree has a well-known canonical OID, but mktree won't produce
    // it from empty stdin without `-z`. We emit it explicitly via hash-object.
    return runGitWithInput(
      repoPath,
      ["hash-object", "-t", "tree", "-w", "--stdin"],
      Buffer.alloc(0),
    );
  }
  const input = entries.map((e) => `${e.mode} ${e.type} ${e.oid}\t${e.name}`).join("\n") + "\n";
  return runGitWithInput(repoPath, ["mktree"], input);
}

async function commitTree(
  repoPath: string,
  treeOid: string,
  message: string,
  parents: string[],
  author: AuthorIdentity,
): Promise<string> {
  const args = ["commit-tree", treeOid];
  for (const p of parents) {
    args.push("-p", p);
  }
  // -F - reads the commit message from stdin so newlines and arbitrary
  // characters are preserved without shell escaping.
  args.push("-F", "-");
  return runGitWithInput(repoPath, args, message, authorEnv(author));
}

async function updateRef(
  repoPath: string,
  ref: string,
  newOid: string,
  oldOid?: string,
): Promise<void> {
  const args = ["update-ref", ref, newOid];
  if (oldOid !== undefined) args.push(oldOid);
  await execFileAsync("git", args, { cwd: repoPath });
}

async function resolveRefOid(repoPath: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repoPath,
    });
    return stdout.toString().trim();
  } catch {
    return null;
  }
}

async function refExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["show-ref", "--verify", "--quiet", ref], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recursive tree update primitives
// ---------------------------------------------------------------------------

type TreeMutation = { kind: "set"; oid: string; mode: string } | { kind: "delete" };

/**
 * Apply a path mutation to a tree, walking down parent directories
 * and re-creating each tree along the way. Returns the new root tree OID
 * (or null if the result is empty and parents collapse). Operates on the
 * given parent commit's tree.
 */
async function applyPathMutation(
  repoPath: string,
  rootTreeOid: string,
  segments: string[],
  mutation: TreeMutation,
  options: { mustExist?: boolean; mustNotExist?: boolean } = {},
): Promise<string> {
  // Read current entries at root tree
  const rootEntries = await readTree(repoPath, rootTreeOid);
  const newRootEntries = await applyAtLevel(repoPath, rootEntries, segments, mutation, options);
  if (newRootEntries.length === 0) {
    // empty tree
    return makeTree(repoPath, []);
  }
  return makeTree(repoPath, newRootEntries);
}

async function applyAtLevel(
  repoPath: string,
  entries: TreeEntry[],
  segments: string[],
  mutation: TreeMutation,
  options: { mustExist?: boolean; mustNotExist?: boolean },
): Promise<TreeEntry[]> {
  const [head, ...rest] = segments;
  if (!head) {
    throw new Error("Empty path segment");
  }

  const idx = entries.findIndex((e) => e.name === head);
  const existing = idx === -1 ? null : entries[idx];

  if (rest.length === 0) {
    // Terminal segment: apply mutation here.
    if (mutation.kind === "set") {
      if (existing && existing.type === "tree") {
        throw new Error(`Path '${head}' is a directory`);
      }
      if (options.mustNotExist && existing) {
        throw new Error(`Path already exists: ${head}`);
      }
      if (options.mustExist && !existing) {
        throw new Error(`Path does not exist: ${head}`);
      }
      const next: TreeEntry = {
        mode: mutation.mode,
        type: "blob",
        oid: mutation.oid,
        name: head,
      };
      if (idx === -1) {
        return [...entries, next];
      }
      const copy = entries.slice();
      copy[idx] = next;
      return copy;
    }
    // delete
    if (!existing) {
      if (options.mustExist) throw new Error(`Path does not exist: ${head}`);
      return entries;
    }
    if (existing.type === "tree") {
      throw new Error(`Path '${head}' is a directory`);
    }
    return entries.filter((_, i) => i !== idx);
  }

  // Non-terminal: descend into a subtree (may need to create it for set mutations)
  if (existing && existing.type === "blob") {
    throw new Error(`Path conflict: '${head}' is a file`);
  }
  let subEntries: TreeEntry[] = [];
  if (existing && existing.type === "tree") {
    subEntries = await readTree(repoPath, existing.oid);
  } else if (mutation.kind === "delete") {
    if (options.mustExist) throw new Error(`Path does not exist: ${head}`);
    return entries;
  }

  const newSubEntries = await applyAtLevel(repoPath, subEntries, rest, mutation, options);

  if (newSubEntries.length === 0) {
    // Subtree is empty after mutation — drop the directory entry entirely.
    if (idx === -1) return entries;
    return entries.filter((_, i) => i !== idx);
  }

  const newSubTreeOid = await makeTree(repoPath, newSubEntries);
  const next: TreeEntry = {
    mode: "040000",
    type: "tree",
    oid: newSubTreeOid,
    name: head,
  };
  if (idx === -1) {
    return [...entries, next];
  }
  const copy = entries.slice();
  copy[idx] = next;
  return copy;
}

// ---------------------------------------------------------------------------
// PR-mode helpers
// ---------------------------------------------------------------------------

async function nextPatchBranch(repoPath: string, username: string): Promise<string> {
  const safeUser = username.replace(/[^a-zA-Z0-9._-]/g, "-");
  for (let i = 1; i < 1000; i++) {
    const candidate = `${safeUser}-patch-${i}`;
    if (!(await refExists(repoPath, `refs/heads/${candidate}`))) {
      return candidate;
    }
  }
  return `${safeUser}-patch-${Date.now()}`;
}

async function createPullRequestRow(
  repoId: string,
  authorId: string,
  title: string,
  body: string | null,
  sourceBranch: string,
  targetBranch: string,
): Promise<{ id: string; number: number }> {
  const [maxIssue] = await db
    .select({ maxNum: max(issues.number) })
    .from(issues)
    .where(eq(issues.repoId, repoId));
  const [maxPR] = await db
    .select({ maxNum: max(pullRequests.number) })
    .from(pullRequests)
    .where(eq(pullRequests.repoId, repoId));

  const nextNumber = Math.max(maxIssue?.maxNum || 0, maxPR?.maxNum || 0) + 1;
  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(pullRequests).values({
    id,
    number: nextNumber,
    repoId,
    title,
    body,
    authorId,
    sourceBranch,
    targetBranch,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });

  return { id, number: nextNumber };
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EditResult {
  ok: true;
  commitOid: string;
  branchRef: string;
  prNumber?: number;
  branchName: string;
}

export type EditError = { error: string };

interface CommonOpts {
  ownerName: string;
  repoName: string;
  ref: string;
  message: string;
  /** Override the repo's editPolicy. */
  mode?: "direct" | "pull_request";
  /** Optional second body for the commit/PR. */
  description?: string;
  /**
   * Optional explicit actor — used by the API layer where the auth happens
   * via Hono middleware rather than the AsyncLocalStorage request context.
   */
  actor?: ActorUser;
}

// ---------------------------------------------------------------------------
// Core write flow
// ---------------------------------------------------------------------------

interface ApplyMutationsArgs {
  repoPath: string;
  parentCommitOid: string;
  mutations: Array<{
    segments: string[];
    mutation: TreeMutation;
    mustExist?: boolean;
    mustNotExist?: boolean;
  }>;
}

async function applyMutationsToParent(args: ApplyMutationsArgs): Promise<string> {
  // Read parent's tree OID
  const parentTreeOid = await runGit(args.repoPath, [
    "rev-parse",
    `${args.parentCommitOid}^{tree}`,
  ]);
  let treeOid = parentTreeOid;
  for (const m of args.mutations) {
    treeOid = await applyPathMutation(args.repoPath, treeOid, m.segments, m.mutation, {
      mustExist: m.mustExist,
      mustNotExist: m.mustNotExist,
    });
  }
  return treeOid;
}

interface PerformEditOpts {
  user: { id: string; username: string; email: string; displayName: string | null };
  repo: ResolvedRepo;
  ref: string;
  message: string;
  description?: string;
  mode: "direct" | "pull_request";
  mutations: ApplyMutationsArgs["mutations"];
  /** PR title/body if mode is pull_request. */
  prTitle?: string;
  prBody?: string | null;
  /** Audit metadata path(s). */
  auditAction: "file.edit" | "file.create" | "file.delete" | "file.rename";
  auditMetadata: Record<string, unknown>;
}

async function performEdit(opts: PerformEditOpts): Promise<EditResult | EditError> {
  const { user, repo, ref, mutations, message, mode } = opts;
  const repoPath = repo.diskPath;

  // Resolve the parent commit on the requested ref.
  const parentOid = await resolveRefOid(repoPath, ref);
  if (!parentOid) {
    return { error: `Branch or ref '${ref}' not found.` };
  }

  // Snapshot refs BEFORE we mutate (for indexer).
  const refsBefore = await snapshotRefs(repoPath);

  // Build new tree.
  let newTreeOid: string;
  try {
    newTreeOid = await applyMutationsToParent({
      repoPath,
      parentCommitOid: parentOid,
      mutations,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update tree" };
  }

  // No-op detection: tree unchanged.
  const parentTreeOid = await runGit(repoPath, ["rev-parse", `${parentOid}^{tree}`]);
  if (newTreeOid === parentTreeOid) {
    return { error: "No changes to commit." };
  }

  // Commit message: include description if provided.
  const fullMessage = opts.description?.trim()
    ? `${message.trim()}\n\n${opts.description.trim()}\n`
    : `${message.trim()}\n`;

  const author: AuthorIdentity = {
    name: user.displayName || user.username,
    email: user.email,
  };

  const newCommitOid = await commitTree(repoPath, newTreeOid, fullMessage, [parentOid], author);

  let branchName: string;
  let branchRef: string;
  let prNumber: number | undefined;

  if (mode === "direct") {
    // Update target ref directly. Allow either a branch refname or HEAD.
    const targetRef = ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
    try {
      await updateRef(repoPath, targetRef, newCommitOid, parentOid);
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Failed to update ref (concurrent change?): ${err.message}`
            : "Failed to update ref",
      };
    }
    branchName = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    branchRef = targetRef;
  } else {
    // PR mode: create new branch pointing at the new commit.
    branchName = await nextPatchBranch(repoPath, user.username);
    branchRef = `refs/heads/${branchName}`;
    await updateRef(repoPath, branchRef, newCommitOid);

    const targetBranch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    const pr = await createPullRequestRow(
      repo.id,
      user.id,
      opts.prTitle?.trim() || message.trim(),
      opts.prBody ?? opts.description?.trim() ?? null,
      branchName,
      targetBranch,
    );
    prNumber = pr.number;
  }

  // Audit log (best effort).
  const req = getRequest();
  logAudit({
    userId: user.id,
    action: opts.auditAction,
    targetType: "repository",
    targetId: repo.id,
    metadata: {
      ...opts.auditMetadata,
      ref,
      branch: branchName,
      commitOid: newCommitOid,
      mode,
      prNumber,
    },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(() => {});

  // Trigger incremental index (fire-and-forget).
  triggerIncrementalIndex(repo.id, repoPath, refsBefore).catch((err) => {
    console.error(`[repo-edit] indexer failed for ${repo.id}:`, err);
  });

  // Bump repo updatedAt (best-effort).
  try {
    await db
      .update(repositories)
      .set({ updatedAt: new Date() })
      .where(eq(repositories.id, repo.id));
  } catch {
    // non-fatal
  }

  return {
    ok: true,
    commitOid: newCommitOid,
    branchRef,
    branchName,
    prNumber,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface EditFileArgs extends CommonOpts {
  path: string;
  content: string;
  /** Optional file mode (default 100644 = regular file). */
  fileMode?: string;
}

export async function editFile(args: EditFileArgs): Promise<EditResult | EditError> {
  const pathErr = validatePath(args.path);
  if (pathErr) return { error: pathErrorMessage(pathErr) };
  if (Buffer.byteLength(args.content, "utf8") > MAX_CONTENT_BYTES) {
    return { error: "Content exceeds 5 MB limit." };
  }
  if (!args.message?.trim()) return { error: "Commit message is required." };

  const resolved = await resolveRepoAndUser(args.ownerName, args.repoName, args.actor);
  if ("error" in resolved) return { error: resolved.error };
  const { user, repo } = resolved;

  const blobOid = await hashObject(repo.diskPath, args.content);
  const segments = args.path.split("/");
  const mode = args.mode || repo.editPolicy;

  return performEdit({
    user,
    repo,
    ref: args.ref,
    message: args.message,
    description: args.description,
    mode,
    mutations: [
      {
        segments,
        mutation: { kind: "set", oid: blobOid, mode: args.fileMode || "100644" },
        mustExist: true,
      },
    ],
    prTitle: args.message,
    prBody: args.description ?? null,
    auditAction: "file.edit",
    auditMetadata: { path: args.path },
  });
}

interface CreateFileArgs extends CommonOpts {
  path: string;
  content: string;
  fileMode?: string;
}

export async function createFile(args: CreateFileArgs): Promise<EditResult | EditError> {
  const pathErr = validatePath(args.path);
  if (pathErr) return { error: pathErrorMessage(pathErr) };
  if (Buffer.byteLength(args.content, "utf8") > MAX_CONTENT_BYTES) {
    return { error: "Content exceeds 5 MB limit." };
  }
  if (!args.message?.trim()) return { error: "Commit message is required." };

  const resolved = await resolveRepoAndUser(args.ownerName, args.repoName, args.actor);
  if ("error" in resolved) return { error: resolved.error };
  const { user, repo } = resolved;

  const blobOid = await hashObject(repo.diskPath, args.content);
  const segments = args.path.split("/");
  const mode = args.mode || repo.editPolicy;

  return performEdit({
    user,
    repo,
    ref: args.ref,
    message: args.message,
    description: args.description,
    mode,
    mutations: [
      {
        segments,
        mutation: { kind: "set", oid: blobOid, mode: args.fileMode || "100644" },
        mustNotExist: true,
      },
    ],
    prTitle: args.message,
    prBody: args.description ?? null,
    auditAction: "file.create",
    auditMetadata: { path: args.path },
  });
}

interface DeleteFileArgs extends CommonOpts {
  path: string;
}

export async function deleteFile(args: DeleteFileArgs): Promise<EditResult | EditError> {
  const pathErr = validatePath(args.path);
  if (pathErr) return { error: pathErrorMessage(pathErr) };
  if (!args.message?.trim()) return { error: "Commit message is required." };

  const resolved = await resolveRepoAndUser(args.ownerName, args.repoName, args.actor);
  if ("error" in resolved) return { error: resolved.error };
  const { user, repo } = resolved;

  const segments = args.path.split("/");
  const mode = args.mode || repo.editPolicy;

  return performEdit({
    user,
    repo,
    ref: args.ref,
    message: args.message,
    description: args.description,
    mode,
    mutations: [
      {
        segments,
        mutation: { kind: "delete" },
        mustExist: true,
      },
    ],
    prTitle: args.message,
    prBody: args.description ?? null,
    auditAction: "file.delete",
    auditMetadata: { path: args.path },
  });
}

interface RenameFileArgs extends CommonOpts {
  oldPath: string;
  newPath: string;
}

export async function renameFile(args: RenameFileArgs): Promise<EditResult | EditError> {
  const oldErr = validatePath(args.oldPath);
  if (oldErr) return { error: pathErrorMessage(oldErr) };
  const newErr = validatePath(args.newPath);
  if (newErr) return { error: pathErrorMessage(newErr) };
  if (args.oldPath === args.newPath) return { error: "New path is the same as old path." };
  if (!args.message?.trim()) return { error: "Commit message is required." };

  const resolved = await resolveRepoAndUser(args.ownerName, args.repoName, args.actor);
  if ("error" in resolved) return { error: resolved.error };
  const { user, repo } = resolved;

  // Read existing blob contents — we copy the OID to the new path.
  const repoPath = repo.diskPath;
  const parentOid = await resolveRefOid(repoPath, args.ref);
  if (!parentOid) return { error: `Branch or ref '${args.ref}' not found.` };

  let oldBlobOid: string | null = null;
  let oldFileMode = "100644";
  try {
    const out = await runGit(repoPath, ["ls-tree", parentOid, args.oldPath]);
    if (out) {
      const tabIdx = out.indexOf("\t");
      const meta = out.slice(0, tabIdx);
      const [m, t, oid] = meta.split(" ");
      if (t === "blob") {
        oldBlobOid = oid;
        oldFileMode = m;
      }
    }
  } catch {
    // fall through
  }
  if (!oldBlobOid) return { error: `Source file '${args.oldPath}' not found.` };

  const segmentsOld = args.oldPath.split("/");
  const segmentsNew = args.newPath.split("/");
  const mode = args.mode || repo.editPolicy;

  return performEdit({
    user,
    repo,
    ref: args.ref,
    message: args.message,
    description: args.description,
    mode,
    mutations: [
      // Delete first so directory cleanup runs before insert at potentially same parent.
      { segments: segmentsOld, mutation: { kind: "delete" }, mustExist: true },
      {
        segments: segmentsNew,
        mutation: { kind: "set", oid: oldBlobOid, mode: oldFileMode },
        mustNotExist: true,
      },
    ],
    prTitle: args.message,
    prBody: args.description ?? null,
    auditAction: "file.rename",
    auditMetadata: { oldPath: args.oldPath, newPath: args.newPath },
  });
}

// ---------------------------------------------------------------------------
// Convenience: fetch the policy and write permission for client UIs.
// ---------------------------------------------------------------------------

export async function getRepoEditContext(
  ownerName: string,
  repoName: string,
): Promise<
  | {
      canWrite: boolean;
      editPolicy: "direct" | "pull_request";
      defaultBranch: string;
    }
  | { error: string }
> {
  const sessionUser = await getSessionUser();
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return { error: "Repository not found" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return { error: "Repository not found" };

  if (!sessionUser) {
    return {
      canWrite: false,
      editPolicy: repo.editPolicy as "direct" | "pull_request",
      defaultBranch: repo.defaultBranch,
    };
  }

  let canWrite = sessionUser.id === owner.id;
  if (!canWrite) {
    const [collab] = await db
      .select()
      .from(repoCollaborators)
      .where(
        and(eq(repoCollaborators.repoId, repo.id), eq(repoCollaborators.userId, sessionUser.id)),
      )
      .limit(1);
    canWrite = !!collab && (collab.permission === "write" || collab.permission === "admin");
  }

  // Archived repos are read-only — hide write affordances even for the owner.
  if (repo.isArchived) canWrite = false;

  return {
    canWrite,
    editPolicy: repo.editPolicy as "direct" | "pull_request",
    defaultBranch: repo.defaultBranch,
  };
}
