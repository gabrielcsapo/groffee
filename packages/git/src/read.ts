import git from "isomorphic-git";
import fs from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitRef {
  name: string;
  oid: string;
  type: "branch" | "tag";
}

export interface TreeEntry {
  name: string;
  path: string;
  type: "blob" | "tree";
  oid: string;
}

export interface CommitInfo {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
  parents: string[];
}

// For bare repos, isomorphic-git needs gitdir instead of dir
function bareOpts(repoPath: string) {
  return { fs, gitdir: repoPath };
}

/**
 * Read the branch that HEAD points to in a bare repo.
 * Returns the branch name (e.g. "main", "master") or null if HEAD is missing/invalid.
 */
export async function resolveHead(repoPath: string): Promise<string | null> {
  try {
    const branches = await git.listBranches({ ...bareOpts(repoPath) });
    if (branches.length === 0) return null;

    // Read the HEAD file directly — it contains "ref: refs/heads/<branch>"
    const head = fs.readFileSync(`${repoPath}/HEAD`, "utf8").trim();
    const match = head.match(/^ref: refs\/heads\/(.+)$/);
    // Only return HEAD's branch if it actually exists
    if (match && branches.includes(match[1])) return match[1];

    // HEAD points to a non-existent branch or is detached — find a match or use first branch
    for (const branch of branches) {
      const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: branch });
      if (oid === head) return branch;
    }
    return branches[0];
  } catch {
    return null;
  }
}

export async function listRefs(repoPath: string): Promise<GitRef[]> {
  const branches = await git.listBranches({ ...bareOpts(repoPath) });
  const tags = await git.listTags({ ...bareOpts(repoPath) });

  const refs: GitRef[] = [];

  for (const name of branches) {
    const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: name });
    refs.push({ name, oid, type: "branch" });
  }

  for (const name of tags) {
    const oid = await git.resolveRef({ ...bareOpts(repoPath), ref: name });
    refs.push({ name, oid, type: "tag" });
  }

  return refs;
}

export async function getTree(
  repoPath: string,
  ref: string,
  path: string = "",
): Promise<TreeEntry[]> {
  const oid = await git.resolveRef({ ...bareOpts(repoPath), ref });
  const { tree } = await git.readTree({
    ...bareOpts(repoPath),
    oid,
    filepath: path || undefined,
  });

  const entries: TreeEntry[] = tree.map((entry) => ({
    name: entry.path,
    path: path ? `${path}/${entry.path}` : entry.path,
    type: entry.type === "tree" ? ("tree" as const) : ("blob" as const),
    oid: entry.oid,
  }));

  // Sort: directories first, then files, both alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function getBlob(
  repoPath: string,
  ref: string,
  path: string,
): Promise<{ content: Uint8Array; oid: string }> {
  const commitOid = await git.resolveRef({ ...bareOpts(repoPath), ref });
  const { blob, oid } = await git.readBlob({
    ...bareOpts(repoPath),
    oid: commitOid,
    filepath: path,
  });

  return { content: blob, oid };
}

/**
 * Read a blob by OID, but only if its size is at most `maxBytes`.
 * Returns null if the blob is larger than `maxBytes`.
 * Uses `git cat-file -s` to check size first, avoiding loading large blobs into memory.
 */
export async function readBlobIfSmall(
  repoPath: string,
  oid: string,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const { stdout: sizeStr } = await execFileAsync("git", ["cat-file", "-s", oid], {
    cwd: repoPath,
  });
  const size = parseInt(sizeStr.trim(), 10);
  if (size > maxBytes) return null;

  const { blob } = await git.readBlob({ ...bareOpts(repoPath), oid });
  return blob;
}

/**
 * Read multiple blobs that are small enough (≤ maxBytes), in just 2 subprocesses:
 *   1. `git cat-file --batch-check` to get sizes
 *   2. `git cat-file --batch` to read content of small ones
 * Returns Map<oid, Buffer> for blobs within the size limit.
 */
export async function readSmallBlobs(
  repoPath: string,
  oids: string[],
  maxBytes: number,
): Promise<Map<string, Buffer>> {
  if (oids.length === 0) return new Map();

  // Step 1: check sizes with --batch-check (1 subprocess)
  const smallOids: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("git", ["cat-file", "--batch-check"], { cwd: repoPath });
    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch-check exited ${code}`));
        return;
      }
      for (const line of output.trim().split("\n")) {
        if (!line) continue;
        const parts = line.split(" ");
        if (parts.length >= 3 && parts[1] === "blob") {
          const size = parseInt(parts[2], 10);
          if (size <= maxBytes) smallOids.push(parts[0]);
        }
      }
      resolve();
    });
    proc.stdin.write(oids.join("\n") + "\n");
    proc.stdin.end();
  });

  if (smallOids.length === 0) return new Map();

  // Step 2: read content of small blobs with --batch (1 subprocess)
  const result = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("git", ["cat-file", "--batch"], { cwd: repoPath });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch exited ${code}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      let offset = 0;
      while (offset < buf.length) {
        // Header line: "<oid> <type> <size>\n"
        const nlIdx = buf.indexOf(0x0a, offset);
        if (nlIdx < 0) break;
        const header = buf.subarray(offset, nlIdx).toString();
        const parts = header.split(" ");
        if (parts.length < 3) break;
        const oid = parts[0];
        const size = parseInt(parts[2], 10);
        const contentStart = nlIdx + 1;
        const contentEnd = contentStart + size;
        if (contentEnd > buf.length) break;
        result.set(oid, buf.subarray(contentStart, contentEnd));
        // Skip trailing newline after content
        offset = contentEnd + 1;
      }
      resolve();
    });
    proc.stdin.write(smallOids.join("\n") + "\n");
    proc.stdin.end();
  });

  return result;
}

export async function getCommitLog(
  repoPath: string,
  ref: string,
  depth: number = 20,
): Promise<CommitInfo[]> {
  const commits = await git.log({ ...bareOpts(repoPath), ref, depth });

  return commits.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message,
    author: {
      name: entry.commit.author.name,
      email: entry.commit.author.email,
      timestamp: entry.commit.author.timestamp,
    },
    committer: {
      name: entry.commit.committer.name,
      email: entry.commit.committer.email,
      timestamp: entry.commit.committer.timestamp,
    },
    parents: entry.commit.parent,
  }));
}

export async function getCommit(repoPath: string, oid: string): Promise<CommitInfo> {
  const { commit } = await git.readCommit({ ...bareOpts(repoPath), oid });

  return {
    oid,
    message: commit.message,
    author: {
      name: commit.author.name,
      email: commit.author.email,
      timestamp: commit.author.timestamp,
    },
    committer: {
      name: commit.committer.name,
      email: commit.committer.email,
      timestamp: commit.committer.timestamp,
    },
    parents: commit.parent,
  };
}

export interface LastCommitInfo {
  oid: string;
  message: string;
  timestamp: number;
}

/**
 * For each path, find the last commit that touched it.
 * Uses a single `git log` call with --name-only to avoid spawning N subprocesses.
 * Directory paths are matched by prefix (e.g. file "src/foo.ts" matches path "src").
 */
export async function getLastCommitsForPaths(
  repoPath: string,
  ref: string,
  paths: string[],
): Promise<Map<string, LastCommitInfo>> {
  if (paths.length === 0) return new Map();

  const result = new Map<string, LastCommitInfo>();
  const remaining = new Set(paths);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--format=COMMIT%x00%H%x00%s%x00%at", "--name-only", ref, "--", ...paths],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 },
    );

    let currentCommit: LastCommitInfo | null = null;

    for (const line of stdout.split("\n")) {
      if (remaining.size === 0) break;

      if (line.startsWith("COMMIT\0")) {
        const parts = line.split("\0");
        currentCommit = {
          oid: parts[1],
          message: parts[2],
          timestamp: parseInt(parts[3], 10),
        };
      } else if (line && currentCommit) {
        // Match file paths against remaining entries (exact or directory prefix)
        for (const p of remaining) {
          if (line === p || line.startsWith(p + "/")) {
            result.set(p, currentCommit);
            remaining.delete(p);
          }
        }
      }
    }
  } catch {
    // Skip if git log fails (e.g. empty repo)
  }

  return result;
}
