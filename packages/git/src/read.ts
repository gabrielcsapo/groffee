import git from "isomorphic-git";
import fs from "node:fs";
import { execFile } from "node:child_process";
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
 * Uses git CLI for performance on bare repos.
 */
export async function getLastCommitsForPaths(
  repoPath: string,
  ref: string,
  paths: string[],
): Promise<Map<string, LastCommitInfo>> {
  const result = new Map<string, LastCommitInfo>();

  const promises = paths.map(async (filePath) => {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "-1", "--format=%H%x00%s%x00%at", ref, "--", filePath],
        { cwd: repoPath, maxBuffer: 1024 * 1024 },
      );
      const trimmed = stdout.trim();
      if (!trimmed) return;
      const [oid, message, ts] = trimmed.split("\0");
      result.set(filePath, {
        oid,
        message,
        timestamp: parseInt(ts, 10),
      });
    } catch {
      // Skip entries where git log fails
    }
  });

  await Promise.all(promises);
  return result;
}
