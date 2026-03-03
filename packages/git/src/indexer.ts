import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BLOB_SIZE = 1 * 1024 * 1024; // 1MB
const BINARY_CHECK_SIZE = 8000;

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
 * Uses `git ls-tree -r` for efficiency with large repos.
 */
export async function walkTree(repoPath: string, commitOid: string): Promise<WalkedTree> {
  // Get the tree OID for this commit
  const { stdout: treeOidStr } = await execFileAsync("git", ["rev-parse", `${commitOid}^{tree}`], {
    cwd: repoPath,
  });
  const rootTreeOid = treeOidStr.trim();

  // List all entries recursively (blobs and trees)
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "-t", "--full-tree", commitOid], {
    cwd: repoPath,
    maxBuffer: 50 * 1024 * 1024,
  });

  const entries: WalkedTreeEntry[] = [];
  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    // Format: <mode> <type> <oid>\t<path>
    const tabIdx = line.indexOf("\t");
    const meta = line.slice(0, tabIdx).split(" ");
    const entryPath = line.slice(tabIdx + 1);
    const entryType = meta[1] === "tree" ? ("tree" as const) : ("blob" as const);
    const entryOid = meta[2];
    const lastSlash = entryPath.lastIndexOf("/");
    const parentPath = lastSlash >= 0 ? entryPath.slice(0, lastSlash) : "";
    const entryName = lastSlash >= 0 ? entryPath.slice(lastSlash + 1) : entryPath;

    entries.push({ parentPath, entryName, entryPath, entryType, entryOid });
  }

  return { rootTreeOid, entries };
}

// --- Blob Reading ---

/**
 * Read a blob's content for indexing. Detects binary files and truncates large ones.
 */
export async function readBlobForIndex(repoPath: string, oid: string): Promise<BlobIndexData> {
  // Check size first to avoid loading huge blobs into memory
  const { stdout: sizeStr } = await execFileAsync("git", ["cat-file", "-s", oid], {
    cwd: repoPath,
  });
  const size = parseInt(sizeStr.trim(), 10);

  // For blobs larger than MAX_BLOB_SIZE, skip content entirely
  if (size > MAX_BLOB_SIZE) {
    return { content: null, size, isBinary: true, isTruncated: true };
  }

  // Read blob content via git cat-file
  const { stdout: rawContent } = await execFileAsync("git", ["cat-file", "blob", oid], {
    cwd: repoPath,
    maxBuffer: MAX_BLOB_SIZE + 1024,
    encoding: "buffer",
  });

  const blob = rawContent as unknown as Buffer;

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

  const content = blob.toString("utf8");
  return { content, size, isBinary, isTruncated: false };
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
 * Uses `git cat-file -p` for reliability with large pack files.
 */
export async function readCommitForIndex(repoPath: string, oid: string): Promise<CommitMeta> {
  const { stdout } = await execFileAsync("git", ["cat-file", "-p", oid], {
    cwd: repoPath,
    maxBuffer: 1024 * 1024,
  });

  const lines = stdout.split("\n");
  let treeOid = "";
  const parentOids: string[] = [];
  let authorName = "";
  let authorEmail = "";
  let authorTimestamp = 0;
  let committerName = "";
  let committerEmail = "";
  let committerTimestamp = 0;
  let headerDone = false;
  const messageLines: string[] = [];

  for (const line of lines) {
    if (headerDone) {
      messageLines.push(line);
      continue;
    }
    if (line === "") {
      headerDone = true;
      continue;
    }
    if (line.startsWith("tree ")) {
      treeOid = line.slice(5);
    } else if (line.startsWith("parent ")) {
      parentOids.push(line.slice(7));
    } else if (line.startsWith("author ")) {
      const match = line.match(/^author (.+) <(.+)> (\d+)/);
      if (match) {
        authorName = match[1];
        authorEmail = match[2];
        authorTimestamp = parseInt(match[3], 10);
      }
    } else if (line.startsWith("committer ")) {
      const match = line.match(/^committer (.+) <(.+)> (\d+)/);
      if (match) {
        committerName = match[1];
        committerEmail = match[2];
        committerTimestamp = parseInt(match[3], 10);
      }
    }
  }

  return {
    oid,
    message: messageLines.join("\n").trim(),
    authorName,
    authorEmail,
    authorTimestamp,
    committerName,
    committerEmail,
    committerTimestamp,
    parentOids,
    treeOid,
  };
}

/**
 * Get the parent OIDs of a commit (without reading full metadata).
 */
export async function getCommitParents(repoPath: string, oid: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["rev-parse", `${oid}^@`], { cwd: repoPath });
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return trimmed.split("\n");
}

/**
 * List all branches and tags with their resolved OIDs.
 * Uses `git for-each-ref` for efficiency.
 */
export async function listAllRefsWithOids(
  repoPath: string,
): Promise<Array<{ name: string; oid: string; type: "branch" | "tag" }>> {
  const { stdout } = await execFileAsync(
    "git",
    ["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/heads", "refs/tags"],
    { cwd: repoPath },
  );

  const result: Array<{ name: string; oid: string; type: "branch" | "tag" }> = [];
  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    const [refname, oid] = line.split("\t");
    if (refname.startsWith("refs/heads/")) {
      result.push({ name: refname.slice("refs/heads/".length), oid, type: "branch" });
    } else if (refname.startsWith("refs/tags/")) {
      result.push({ name: refname.slice("refs/tags/".length), oid, type: "tag" });
    }
  }

  return result;
}

// --- Ref Snapshots ---

/**
 * Snapshot all branches and tags with their current OIDs.
 */
export async function snapshotRefs(repoPath: string): Promise<Map<string, string>> {
  const refs = new Map<string, string>();
  const { stdout } = await execFileAsync(
    "git",
    ["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/heads", "refs/tags"],
    { cwd: repoPath },
  );

  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    const [refname, oid] = line.split("\t");
    if (refname.startsWith("refs/heads/")) {
      refs.set(`branch:${refname.slice("refs/heads/".length)}`, oid);
    } else if (refname.startsWith("refs/tags/")) {
      refs.set(`tag:${refname.slice("refs/tags/".length)}`, oid);
    }
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
 * Uses `git rev-list --first-parent` for efficiency.
 */
export async function walkAncestry(
  repoPath: string,
  tipOid: string,
  maxDepth: number = 5000,
): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-list", "--first-parent", `--max-count=${maxDepth}`, tipOid],
    { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 },
  );

  return stdout.trim().split("\n").filter(Boolean);
}
