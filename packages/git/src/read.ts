import git from "isomorphic-git";
import fs from "node:fs";

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

export async function getCommit(
  repoPath: string,
  oid: string,
): Promise<CommitInfo> {
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
