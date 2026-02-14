import git from "isomorphic-git";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BLOB_SIZE = 1 * 1024 * 1024; // 1MB
const BINARY_CHECK_SIZE = 8000;

function bareOpts(repoPath: string) {
  return { fs, gitdir: repoPath };
}

// --- Types ---

export interface WalkedTreeEntry {
  parentPath: string;
  entryName: string;
  entryPath: string;
  entryType: "blob" | "tree";
  entryOid: string;
}

export interface WalkedTree {
  rootTreeOid: string;
  entries: WalkedTreeEntry[];
}

export interface BlobIndexData {
  content: string | null;
  size: number;
  isBinary: boolean;
  isTruncated: boolean;
}

export interface ChangedFile {
  path: string;
  changeType: "add" | "modify" | "delete" | "rename";
}

export interface RefChange {
  name: string;
  type: "branch" | "tag";
  oldOid: string | null;
  newOid: string | null;
}

export interface CommitMeta {
  oid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorTimestamp: number;
  committerName: string;
  committerEmail: string;
  committerTimestamp: number;
  parentOids: string[];
  treeOid: string;
}

// --- Tree Walking ---

/**
 * Recursively walk a commit's tree and return all entries flattened.
 */
export async function walkTree(repoPath: string, commitOid: string): Promise<WalkedTree> {
  const { commit } = await git.readCommit({ ...bareOpts(repoPath), oid: commitOid });
  const rootTreeOid = commit.tree;
  const entries: WalkedTreeEntry[] = [];

  async function recurse(treeOid: string, parentPath: string) {
    const { tree } = await git.readTree({ ...bareOpts(repoPath), oid: treeOid });
    for (const entry of tree) {
      const entryPath = parentPath ? `${parentPath}/${entry.path}` : entry.path;
      const entryType = entry.type === "tree" ? ("tree" as const) : ("blob" as const);
      entries.push({
        parentPath,
        entryName: entry.path,
        entryPath,
        entryType,
        entryOid: entry.oid,
      });
      if (entry.type === "tree") {
        await recurse(entry.oid, entryPath);
      }
    }
  }

  await recurse(rootTreeOid, "");
  return { rootTreeOid, entries };
}

// --- Blob Reading ---

/**
 * Read a blob's content for indexing. Detects binary files and truncates large ones.
 */
export async function readBlobForIndex(repoPath: string, oid: string): Promise<BlobIndexData> {
  const { blob } = await git.readBlob({ ...bareOpts(repoPath), oid });
  const size = blob.length;

  // Binary detection: check for null bytes in first 8KB
  const checkLen = Math.min(blob.length, BINARY_CHECK_SIZE);
  let isBinary = false;
  for (let i = 0; i < checkLen; i++) {
    if (blob[i] === 0) {
      isBinary = true;
      break;
    }
  }

  if (isBinary) {
    return { content: null, size, isBinary: true, isTruncated: false };
  }

  const isTruncated = size > MAX_BLOB_SIZE;
  const slice = isTruncated ? blob.slice(0, MAX_BLOB_SIZE) : blob;
  const content = new TextDecoder().decode(slice);

  return { content, size, isBinary, isTruncated };
}

// --- Changed Files ---

/**
 * Get which files changed between a parent commit and a commit.
 * For initial commits (no parent), all files are listed as "add".
 */
export async function getChangedFiles(
  repoPath: string,
  parentOid: string | null,
  commitOid: string,
): Promise<ChangedFile[]> {
  if (!parentOid) {
    // Initial commit: all files are additions
    const { stdout } = await execFileAsync(
      "git",
      ["diff-tree", "--no-commit-id", "-r", "--name-status", "--root", commitOid],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        return { path: parts.slice(1).join("\t"), changeType: "add" as const };
      });
  }

  const { stdout } = await execFileAsync(
    "git",
    ["diff-tree", "-r", "--name-status", "-M", parentOid, commitOid],
    { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const statusCode = parts[0];
      let changeType: ChangedFile["changeType"];
      switch (statusCode[0]) {
        case "A":
          changeType = "add";
          break;
        case "M":
          changeType = "modify";
          break;
        case "D":
          changeType = "delete";
          break;
        case "R":
          changeType = "rename";
          break;
        default:
          changeType = "modify";
      }
      // For renames, parts has [status, oldPath, newPath]
      const path = parts.length > 2 ? parts[2] : parts[1];
      return { path, changeType };
    });
}

// --- Commit Reading ---

/**
 * Read full commit metadata for indexing.
 */
export async function readCommitForIndex(repoPath: string, oid: string): Promise<CommitMeta> {
  const { commit } = await git.readCommit({ ...bareOpts(repoPath), oid });
  return {
    oid,
    message: commit.message,
    authorName: commit.author.name,
    authorEmail: commit.author.email,
    authorTimestamp: commit.author.timestamp,
    committerName: commit.committer.name,
    committerEmail: commit.committer.email,
    committerTimestamp: commit.committer.timestamp,
    parentOids: commit.parent,
    treeOid: commit.tree,
  };
}

/**
 * Get the parent OIDs of a commit (without reading full metadata).
 */
export async function getCommitParents(repoPath: string, oid: string): Promise<string[]> {
  const { commit } = await git.readCommit({ ...bareOpts(repoPath), oid });
  return commit.parent;
}

/**
 * List all branches and tags with their resolved OIDs.
 */
export async function listAllRefsWithOids(
  repoPath: string,
): Promise<Array<{ name: string; oid: string; type: "branch" | "tag" }>> {
  const result: Array<{ name: string; oid: string; type: "branch" | "tag" }> = [];

  try {
    const branches = await git.listBranches({ ...bareOpts(repoPath) });
    for (const name of branches) {
      const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: name });
      result.push({ name, oid, type: "branch" });
    }
  } catch {
    // Empty repo
  }

  try {
    const tags = await git.listTags({ ...bareOpts(repoPath) });
    for (const name of tags) {
      const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: name });
      result.push({ name, oid, type: "tag" });
    }
  } catch {
    // No tags
  }

  return result;
}

// --- Ref Snapshots ---

/**
 * Snapshot all branches and tags with their current OIDs.
 */
export async function snapshotRefs(repoPath: string): Promise<Map<string, string>> {
  const refs = new Map<string, string>();

  try {
    const branches = await git.listBranches({ ...bareOpts(repoPath) });
    for (const branch of branches) {
      const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: branch });
      refs.set(`branch:${branch}`, oid);
    }
  } catch {
    // Empty repo — no branches
  }

  try {
    const tags = await git.listTags({ ...bareOpts(repoPath) });
    for (const tag of tags) {
      const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: tag });
      refs.set(`tag:${tag}`, oid);
    }
  } catch {
    // No tags
  }

  return refs;
}

/**
 * Compare two ref snapshots and return what changed.
 */
export function diffRefSnapshots(
  before: Map<string, string>,
  after: Map<string, string>,
): RefChange[] {
  const changes: RefChange[] = [];

  // New or updated refs
  for (const [key, newOid] of after) {
    const colonIdx = key.indexOf(":");
    const type = key.slice(0, colonIdx) as "branch" | "tag";
    const name = key.slice(colonIdx + 1);
    const oldOid = before.get(key) || null;
    if (oldOid !== newOid) {
      changes.push({ name, type, oldOid, newOid });
    }
  }

  // Deleted refs
  for (const [key, oldOid] of before) {
    if (!after.has(key)) {
      const colonIdx = key.indexOf(":");
      const type = key.slice(0, colonIdx) as "branch" | "tag";
      const name = key.slice(colonIdx + 1);
      changes.push({ name, type, oldOid, newOid: null });
    }
  }

  return changes;
}

/**
 * Walk the first-parent ancestry chain from a tip commit.
 * Returns OIDs in order: [tip, parent, grandparent, ...].
 */
export async function walkAncestry(
  repoPath: string,
  tipOid: string,
  maxDepth: number = 5000,
): Promise<string[]> {
  const chain: string[] = [];
  let currentOid: string | null = tipOid;

  while (currentOid && chain.length < maxDepth) {
    chain.push(currentOid);
    try {
      const { commit } = await git.readCommit({ ...bareOpts(repoPath), oid: currentOid });
      currentOid = commit.parent.length > 0 ? commit.parent[0] : null;
    } catch {
      break;
    }
  }

  return chain;
}
