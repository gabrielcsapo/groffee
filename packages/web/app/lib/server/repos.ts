"use server";

import {
  db,
  repositories,
  users,
  gitRefs,
  gitCommits,
  gitCommitAncestry,
  gitTreeEntries,
  gitBlobs,
  gitCommitFiles,
  auditLogs,
  pullRequests,
  issues,
} from "@groffee/db";
import { eq, and, like, desc, asc, sql } from "drizzle-orm";
import {
  initBareRepo,
  getTree,
  getBlob,
  getCommitLog,
  getCommit,
  listRefs,
  resolveHead,
  getLastCommitsForPaths,
  getDiff,
} from "@groffee/git";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
);
const DATA_DIR =
  process.env.DATA_DIR || path.resolve(PROJECT_ROOT, "data", "repositories");

// --- Helpers ---

async function findRepo(
  ownerName: string,
  repoName: string,
  currentUserId?: string,
) {
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);
  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return null;
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return repo;
}

async function resolveRefAndPath(
  repoId: string,
  defaultBranch: string,
  refAndPath: string,
): Promise<{ ref: string; subPath: string; fromIndex: boolean }> {
  const indexedRefs = await db
    .select({ name: gitRefs.name })
    .from(gitRefs)
    .where(eq(gitRefs.repoId, repoId));

  const refNames = indexedRefs.map((r) => r.name);

  if (refNames.length > 0) {
    const parts = refAndPath.split("/");
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        return {
          ref: candidate,
          subPath: parts.slice(i).join("/"),
          fromIndex: true,
        };
      }
    }
    if (parts.length > 0) {
      return {
        ref: parts[0],
        subPath: parts.slice(1).join("/"),
        fromIndex: true,
      };
    }
  }

  return { ref: defaultBranch, subPath: refAndPath, fromIndex: false };
}

// --- Read Functions ---

export async function getPublicRepos(
  opts: { limit?: number; offset?: number; q?: string } = {},
) {
  const limit = Math.min(opts.limit || 30, 100);
  const offset = opts.offset || 0;
  const q = opts.q?.trim();

  const condition = q
    ? and(eq(repositories.isPublic, true), like(repositories.name, `%${q}%`))
    : eq(repositories.isPublic, true);

  const repos = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      description: repositories.description,
      isPublic: repositories.isPublic,
      ownerId: repositories.ownerId,
      updatedAt: repositories.updatedAt,
      createdAt: repositories.createdAt,
    })
    .from(repositories)
    .where(condition)
    .orderBy(desc(repositories.updatedAt))
    .limit(limit)
    .offset(offset);

  // Attach owner usernames
  const ownerIds = [...new Set(repos.map((r) => r.ownerId))];
  const owners =
    ownerIds.length > 0
      ? await Promise.all(
          ownerIds.map(async (id) => {
            const [u] = await db
              .select()
              .from(users)
              .where(eq(users.id, id))
              .limit(1);
            return u;
          }),
        )
      : [];
  const ownerMap = new Map(
    owners.filter(Boolean).map((u) => [u.id, u.username]),
  );

  const result = repos.map((r) => ({
    ...r,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    owner: ownerMap.get(r.ownerId) || "unknown",
  }));

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(repositories)
    .where(condition);

  return { repositories: result, total: countRow.count };
}

export async function getUserRepos(ownerName: string) {
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);
  if (!owner) return { error: "User not found" };

  const currentUser = await getSessionUser();
  const isOwner = currentUser?.id === owner.id;

  const repos = isOwner
    ? await db
        .select()
        .from(repositories)
        .where(eq(repositories.ownerId, owner.id))
    : await db
        .select()
        .from(repositories)
        .where(
          and(
            eq(repositories.ownerId, owner.id),
            eq(repositories.isPublic, true),
          ),
        );

  const serialized = repos.map((r) => ({
    ...r,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  }));

  return { repositories: serialized };
}

export async function getRepo(ownerName: string, repoName: string) {
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.username, ownerName))
    .limit(1);
  if (!owner) return { error: "User not found" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return { error: "Repository not found" };

  const currentUser = await getSessionUser();
  if (!repo.isPublic && currentUser?.id !== owner.id) {
    return { error: "Repository not found" };
  }

  const isOwner = currentUser?.id === owner.id;

  const headBranch = await resolveHead(repo.diskPath);
  const defaultBranch = headBranch || repo.defaultBranch;

  return {
    repository: {
      ...repo,
      defaultBranch,
      owner: ownerName,
      isOwner,
      createdAt:
        repo.createdAt instanceof Date
          ? repo.createdAt.toISOString()
          : repo.createdAt,
      updatedAt:
        repo.updatedAt instanceof Date
          ? repo.updatedAt.toISOString()
          : repo.updatedAt,
    },
  };
}

export async function getRepoRefs(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  // Try indexed refs first
  const indexedRefs = await db
    .select({
      name: gitRefs.name,
      oid: gitRefs.commitOid,
      type: gitRefs.type,
    })
    .from(gitRefs)
    .where(eq(gitRefs.repoId, repo.id));

  if (indexedRefs.length > 0) {
    const headBranch = await resolveHead(repo.diskPath);
    return {
      refs: indexedRefs,
      defaultBranch: headBranch || repo.defaultBranch,
    };
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const headBranch = await resolveHead(repo.diskPath);
    return { refs, defaultBranch: headBranch || repo.defaultBranch };
  } catch {
    return { refs: [], defaultBranch: repo.defaultBranch };
  }
}

export async function getRepoTree(
  ownerName: string,
  repoName: string,
  refAndPath: string,
) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  const { ref, subPath: treePath } = await resolveRefAndPath(
    repo.id,
    repo.defaultBranch,
    refAndPath,
  );

  // Try indexed data first
  try {
    const [refRecord] = await db
      .select({ commitOid: gitRefs.commitOid })
      .from(gitRefs)
      .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, ref)))
      .limit(1);

    if (refRecord) {
      const [commitRecord] = await db
        .select({ treeOid: gitCommits.treeOid })
        .from(gitCommits)
        .where(
          and(
            eq(gitCommits.repoId, repo.id),
            eq(gitCommits.oid, refRecord.commitOid),
          ),
        )
        .limit(1);

      if (commitRecord) {
        const entries = await db
          .select({
            name: gitTreeEntries.entryName,
            path: gitTreeEntries.entryPath,
            type: gitTreeEntries.entryType,
            oid: gitTreeEntries.entryOid,
          })
          .from(gitTreeEntries)
          .where(
            and(
              eq(gitTreeEntries.repoId, repo.id),
              eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
              eq(gitTreeEntries.parentPath, treePath),
            ),
          )
          .orderBy(
            desc(gitTreeEntries.entryType),
            asc(gitTreeEntries.entryName),
          );

        if (entries.length > 0) {
          const paths = entries.map((e) => e.path);
          const lastCommitRows = await db
            .select({
              filePath: gitCommitFiles.filePath,
              commitOid: gitCommitAncestry.commitOid,
              depth: gitCommitAncestry.depth,
              message: gitCommits.message,
              authorTimestamp: gitCommits.authorTimestamp,
              authorName: gitCommits.authorName,
              authorEmail: gitCommits.authorEmail,
            })
            .from(gitCommitFiles)
            .innerJoin(
              gitCommitAncestry,
              and(
                eq(gitCommitAncestry.repoId, gitCommitFiles.repoId),
                eq(gitCommitAncestry.commitOid, gitCommitFiles.commitOid),
                eq(gitCommitAncestry.refName, ref),
              ),
            )
            .innerJoin(
              gitCommits,
              and(
                eq(gitCommits.repoId, gitCommitFiles.repoId),
                eq(gitCommits.oid, gitCommitFiles.commitOid),
              ),
            )
            .where(
              and(
                eq(gitCommitFiles.repoId, repo.id),
                sql`${gitCommitFiles.filePath} IN ${paths}`,
              ),
            )
            .orderBy(asc(gitCommitAncestry.depth));

          const lastCommitMap = new Map<
            string,
            {
              oid: string;
              message: string;
              timestamp: number;
              author: string;
              authorEmail: string;
            }
          >();
          for (const row of lastCommitRows) {
            if (!lastCommitMap.has(row.filePath)) {
              lastCommitMap.set(row.filePath, {
                oid: row.commitOid,
                message: row.message,
                timestamp: row.authorTimestamp,
                author: row.authorName,
                authorEmail: row.authorEmail,
              });
            }
          }

          const entriesWithCommits = entries.map((entry) => ({
            ...entry,
            lastCommit: lastCommitMap.get(entry.path) || null,
          }));

          return { entries: entriesWithCommits, ref, path: treePath };
        }
      }
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const refNames = refs.map((r) => r.name);

    let gitRef = ref;
    let gitTreePath = treePath;
    const parts = refAndPath.split("/");
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        gitRef = candidate;
        gitTreePath = parts.slice(i).join("/");
        break;
      }
    }

    const entries = await getTree(repo.diskPath, gitRef, gitTreePath);
    const paths = entries.map((e) => e.path);
    const lastCommits = await getLastCommitsForPaths(
      repo.diskPath,
      gitRef,
      paths,
    );

    const entriesWithCommits = entries.map((entry) => {
      const commit = lastCommits.get(entry.path);
      return { ...entry, lastCommit: commit || null };
    });

    return { entries: entriesWithCommits, ref: gitRef, path: gitTreePath };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read tree";
    return { error: message };
  }
}

export async function getRepoBlob(
  ownerName: string,
  repoName: string,
  refAndPath: string,
) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  const { ref, subPath: filePath } = await resolveRefAndPath(
    repo.id,
    repo.defaultBranch,
    refAndPath,
  );

  // Try indexed data first
  try {
    const [refRecord] = await db
      .select({ commitOid: gitRefs.commitOid })
      .from(gitRefs)
      .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, ref)))
      .limit(1);

    if (refRecord) {
      const [commitRecord] = await db
        .select({ treeOid: gitCommits.treeOid })
        .from(gitCommits)
        .where(
          and(
            eq(gitCommits.repoId, repo.id),
            eq(gitCommits.oid, refRecord.commitOid),
          ),
        )
        .limit(1);

      if (commitRecord) {
        const [treeEntry] = await db
          .select({ entryOid: gitTreeEntries.entryOid })
          .from(gitTreeEntries)
          .where(
            and(
              eq(gitTreeEntries.repoId, repo.id),
              eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
              eq(gitTreeEntries.entryPath, filePath),
            ),
          )
          .limit(1);

        if (treeEntry) {
          const [blob] = await db
            .select()
            .from(gitBlobs)
            .where(
              and(
                eq(gitBlobs.repoId, repo.id),
                eq(gitBlobs.oid, treeEntry.entryOid),
              ),
            )
            .limit(1);

          if (blob) {
            if (blob.isBinary) {
              return {
                content: null,
                isBinary: true,
                oid: blob.oid,
                size: blob.size,
                ref,
                path: filePath,
              };
            }
            if (!blob.isTruncated) {
              return {
                content: blob.content,
                oid: blob.oid,
                ref,
                path: filePath,
              };
            }
          }
        }
      }
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git
  try {
    const refs = await listRefs(repo.diskPath);
    const refNames = refs.map((r) => r.name);

    let gitRef = ref;
    let gitFilePath = filePath;
    const parts = refAndPath.split("/");
    for (let i = parts.length - 1; i > 0; i--) {
      const candidate = parts.slice(0, i).join("/");
      if (refNames.includes(candidate)) {
        gitRef = candidate;
        gitFilePath = parts.slice(i).join("/");
        break;
      }
    }

    const { content, oid } = await getBlob(repo.diskPath, gitRef, gitFilePath);
    const text = new TextDecoder().decode(content);
    return { content: text, oid, ref: gitRef, path: gitFilePath };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read file";
    return { error: message };
  }
}

export async function getRepoCommits(
  ownerName: string,
  repoName: string,
  ref: string,
  opts: { limit?: number; authorEmail?: string } = {},
) {
  const { limit = 30, authorEmail } = opts;
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  // Get branches for the branch selector
  const branches = await db
    .select({ name: gitRefs.name })
    .from(gitRefs)
    .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.type, "branch")))
    .orderBy(gitRefs.name);

  // Get contributors on this ref (always unfiltered so the dropdown works)
  const authors = await db
    .select({
      name: gitCommits.authorName,
      email: gitCommits.authorEmail,
      commits: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommitAncestry)
    .innerJoin(
      gitCommits,
      and(
        eq(gitCommits.repoId, gitCommitAncestry.repoId),
        eq(gitCommits.oid, gitCommitAncestry.commitOid),
      ),
    )
    .where(
      and(
        eq(gitCommitAncestry.repoId, repo.id),
        eq(gitCommitAncestry.refName, ref),
      ),
    )
    .groupBy(gitCommits.authorEmail)
    .orderBy(sql`count(*) desc`);

  // Try indexed data first
  try {
    const conditions = [
      eq(gitCommitAncestry.repoId, repo.id),
      eq(gitCommitAncestry.refName, ref),
      ...(authorEmail ? [eq(gitCommits.authorEmail, authorEmail)] : []),
    ];

    const commitList = await db
      .select({
        oid: gitCommits.oid,
        message: gitCommits.message,
        authorName: gitCommits.authorName,
        authorEmail: gitCommits.authorEmail,
        authorTimestamp: gitCommits.authorTimestamp,
        committerName: gitCommits.committerName,
        committerEmail: gitCommits.committerEmail,
        committerTimestamp: gitCommits.committerTimestamp,
        parentOids: gitCommits.parentOids,
      })
      .from(gitCommitAncestry)
      .innerJoin(
        gitCommits,
        and(
          eq(gitCommits.repoId, gitCommitAncestry.repoId),
          eq(gitCommits.oid, gitCommitAncestry.commitOid),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(gitCommitAncestry.depth))
      .limit(limit);

    if (commitList.length > 0) {
      const commits = commitList.map((c) => ({
        oid: c.oid,
        message: c.message,
        author: {
          name: c.authorName,
          email: c.authorEmail,
          timestamp: c.authorTimestamp,
        },
        committer: {
          name: c.committerName,
          email: c.committerEmail,
          timestamp: c.committerTimestamp,
        },
        parents: JSON.parse(c.parentOids) as string[],
      }));
      return {
        commits,
        ref,
        defaultBranch: repo.defaultBranch,
        branches: branches.map((b) => b.name),
        authors,
      };
    }
  } catch {
    // Index read failed, fall through to git
  }

  // Fallback to git (no author filter available here)
  try {
    const commits = await getCommitLog(repo.diskPath, ref, limit);
    return {
      commits,
      ref,
      defaultBranch: repo.defaultBranch,
      branches: branches.map((b) => b.name),
      authors,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read commits";
    return { error: message };
  }
}

export async function getRepoCommit(
  ownerName: string,
  repoName: string,
  sha: string,
) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  // Try indexed commit metadata
  try {
    const [indexed] = await db
      .select()
      .from(gitCommits)
      .where(and(eq(gitCommits.repoId, repo.id), eq(gitCommits.oid, sha)))
      .limit(1);

    if (indexed) {
      const parents = JSON.parse(indexed.parentOids) as string[];
      const commit = {
        oid: indexed.oid,
        message: indexed.message,
        author: {
          name: indexed.authorName,
          email: indexed.authorEmail,
          timestamp: indexed.authorTimestamp,
        },
        committer: {
          name: indexed.committerName,
          email: indexed.committerEmail,
          timestamp: indexed.committerTimestamp,
        },
        parents,
      };

      let diff = null;
      if (parents.length > 0) {
        diff = await getDiff(repo.diskPath, parents[0], sha);
      }
      return { commit, diff };
    }
  } catch {
    // Fall through to git
  }

  // Fallback to git
  try {
    const commit = await getCommit(repo.diskPath, sha);
    let diff = null;
    if (commit.parents.length > 0) {
      diff = await getDiff(repo.diskPath, commit.parents[0], sha);
    }
    return { commit, diff };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to read commit";
    return { error: message };
  }
}

const LANGUAGE_MAP: Record<string, { name: string; color: string }> = {
  ts: { name: "TypeScript", color: "#3178c6" },
  tsx: { name: "TypeScript", color: "#3178c6" },
  js: { name: "JavaScript", color: "#f1e05a" },
  jsx: { name: "JavaScript", color: "#f1e05a" },
  mjs: { name: "JavaScript", color: "#f1e05a" },
  cjs: { name: "JavaScript", color: "#f1e05a" },
  py: { name: "Python", color: "#3572A5" },
  rb: { name: "Ruby", color: "#701516" },
  go: { name: "Go", color: "#00ADD8" },
  rs: { name: "Rust", color: "#dea584" },
  java: { name: "Java", color: "#b07219" },
  kt: { name: "Kotlin", color: "#A97BFF" },
  swift: { name: "Swift", color: "#F05138" },
  c: { name: "C", color: "#555555" },
  h: { name: "C", color: "#555555" },
  cpp: { name: "C++", color: "#f34b7d" },
  cc: { name: "C++", color: "#f34b7d" },
  hpp: { name: "C++", color: "#f34b7d" },
  cs: { name: "C#", color: "#178600" },
  php: { name: "PHP", color: "#4F5D95" },
  html: { name: "HTML", color: "#e34c26" },
  htm: { name: "HTML", color: "#e34c26" },
  css: { name: "CSS", color: "#563d7c" },
  scss: { name: "SCSS", color: "#c6538c" },
  less: { name: "Less", color: "#1d365d" },
  vue: { name: "Vue", color: "#41b883" },
  svelte: { name: "Svelte", color: "#ff3e00" },
  json: { name: "JSON", color: "#292929" },
  yaml: { name: "YAML", color: "#cb171e" },
  yml: { name: "YAML", color: "#cb171e" },
  toml: { name: "TOML", color: "#9c4221" },
  xml: { name: "XML", color: "#0060ac" },
  md: { name: "Markdown", color: "#083fa1" },
  markdown: { name: "Markdown", color: "#083fa1" },
  sh: { name: "Shell", color: "#89e051" },
  bash: { name: "Shell", color: "#89e051" },
  zsh: { name: "Shell", color: "#89e051" },
  sql: { name: "SQL", color: "#e38c00" },
  dockerfile: { name: "Dockerfile", color: "#384d54" },
  lua: { name: "Lua", color: "#000080" },
  r: { name: "R", color: "#198CE7" },
  scala: { name: "Scala", color: "#c22d40" },
  dart: { name: "Dart", color: "#00B4AB" },
  zig: { name: "Zig", color: "#ec915c" },
  ex: { name: "Elixir", color: "#6e4a7e" },
  exs: { name: "Elixir", color: "#6e4a7e" },
  erl: { name: "Erlang", color: "#B83998" },
  hs: { name: "Haskell", color: "#5e5086" },
  ml: { name: "OCaml", color: "#3be133" },
  clj: { name: "Clojure", color: "#db5855" },
  nim: { name: "Nim", color: "#ffc200" },
};

export async function getRepoLanguages(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  // Get HEAD ref's tree OID
  const headBranch = await resolveHead(repo.diskPath);
  const defaultBranch = headBranch || repo.defaultBranch;

  const [refRecord] = await db
    .select({ commitOid: gitRefs.commitOid })
    .from(gitRefs)
    .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, defaultBranch)))
    .limit(1);

  if (!refRecord) return { languages: [] };

  const [commitRecord] = await db
    .select({ treeOid: gitCommits.treeOid })
    .from(gitCommits)
    .where(
      and(
        eq(gitCommits.repoId, repo.id),
        eq(gitCommits.oid, refRecord.commitOid),
      ),
    )
    .limit(1);

  if (!commitRecord) return { languages: [] };

  // Get all blob entries joined with gitBlobs for actual file sizes
  const blobs = await db
    .select({
      name: gitTreeEntries.entryName,
      size: gitBlobs.size,
    })
    .from(gitTreeEntries)
    .innerJoin(
      gitBlobs,
      and(
        eq(gitBlobs.repoId, gitTreeEntries.repoId),
        eq(gitBlobs.oid, gitTreeEntries.entryOid),
      ),
    )
    .where(
      and(
        eq(gitTreeEntries.repoId, repo.id),
        eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
        eq(gitTreeEntries.entryType, "blob"),
      ),
    );

  // Group by language
  const langBytes = new Map<string, { bytes: number; color: string }>();
  let totalBytes = 0;

  for (const blob of blobs) {
    const ext = blob.name.split(".").pop()?.toLowerCase();
    if (!ext) continue;
    const lang = LANGUAGE_MAP[ext];
    if (!lang) continue;
    // Use blob size, or fall back to counting 1 byte per file for presence
    const size = blob.size || 1;

    const existing = langBytes.get(lang.name);
    if (existing) {
      existing.bytes += size;
    } else {
      langBytes.set(lang.name, { bytes: size, color: lang.color });
    }
    totalBytes += size;
  }

  if (totalBytes === 0) return { languages: [] };

  const languages = [...langBytes.entries()]
    .map(([name, { bytes, color }]) => ({
      name,
      color,
      percentage: Math.round((bytes / totalBytes) * 1000) / 10,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return { languages };
}

export async function getRepoFilePaths(
  ownerName: string,
  repoName: string,
  ref?: string,
) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { paths: [] };

  const headBranch = await resolveHead(repo.diskPath);
  const targetRef = ref || headBranch || repo.defaultBranch;

  const [refRecord] = await db
    .select({ commitOid: gitRefs.commitOid })
    .from(gitRefs)
    .where(and(eq(gitRefs.repoId, repo.id), eq(gitRefs.name, targetRef)))
    .limit(1);

  if (!refRecord) return { paths: [], ref: targetRef };

  const [commitRecord] = await db
    .select({ treeOid: gitCommits.treeOid })
    .from(gitCommits)
    .where(
      and(
        eq(gitCommits.repoId, repo.id),
        eq(gitCommits.oid, refRecord.commitOid),
      ),
    )
    .limit(1);

  if (!commitRecord) return { paths: [], ref: targetRef };

  const entries = await db
    .select({ path: gitTreeEntries.entryPath })
    .from(gitTreeEntries)
    .where(
      and(
        eq(gitTreeEntries.repoId, repo.id),
        eq(gitTreeEntries.rootTreeOid, commitRecord.treeOid),
        eq(gitTreeEntries.entryType, "blob"),
      ),
    )
    .orderBy(asc(gitTreeEntries.entryPath));

  return { paths: entries.map((e) => e.path), ref: targetRef };
}

export async function getRepoActivity(ownerName: string, repoName: string, authorEmail?: string) {
  const currentUser = await getSessionUser();
  const repo = await findRepo(ownerName, repoName, currentUser?.id);
  if (!repo) return { error: "Repository not found" };

  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 86400;

  // Base conditions for commit queries (optionally filtered by author)
  const commitConditions = [
    eq(gitCommits.repoId, repo.id),
    sql`${gitCommits.authorTimestamp} >= ${oneYearAgo}`,
    ...(authorEmail ? [eq(gitCommits.authorEmail, authorEmail)] : []),
  ];

  const dailyRows = await db
    .select({
      day: sql<number>`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(and(...commitConditions))
    .groupBy(
      sql`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`,
    )
    .orderBy(
      sql`cast((${gitCommits.authorTimestamp} / 86400) * 86400 as integer)`,
    );

  const weeklyRows = await db
    .select({
      week: sql<number>`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(and(...commitConditions))
    .groupBy(
      sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
    )
    .orderBy(
      sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
    );

  // Contributors always show all (not filtered) so the dropdown works
  const contributors = await db
    .select({
      name: gitCommits.authorName,
      email: gitCommits.authorEmail,
      commits: sql<number>`cast(count(*) as integer)`,
      lastCommitAt: sql<number>`cast(max(${gitCommits.authorTimestamp}) as integer)`,
    })
    .from(gitCommits)
    .where(eq(gitCommits.repoId, repo.id))
    .groupBy(gitCommits.authorEmail)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  // Daily PR counts (by createdAt, stored as epoch seconds via mode:"timestamp")
  const dailyPRRows = await db
    .select({
      day: sql<number>`cast((cast(${pullRequests.createdAt} as integer) / 86400) * 86400 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(pullRequests)
    .where(
      and(
        eq(pullRequests.repoId, repo.id),
        sql`cast(${pullRequests.createdAt} as integer) >= ${oneYearAgo}`,
      ),
    )
    .groupBy(
      sql`cast((cast(${pullRequests.createdAt} as integer) / 86400) * 86400 as integer)`,
    )
    .orderBy(
      sql`cast((cast(${pullRequests.createdAt} as integer) / 86400) * 86400 as integer)`,
    );

  // Daily issue counts (by createdAt)
  const dailyIssueRows = await db
    .select({
      day: sql<number>`cast((cast(${issues.createdAt} as integer) / 86400) * 86400 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(issues)
    .where(
      and(
        eq(issues.repoId, repo.id),
        sql`cast(${issues.createdAt} as integer) >= ${oneYearAgo}`,
      ),
    )
    .groupBy(
      sql`cast((cast(${issues.createdAt} as integer) / 86400) * 86400 as integer)`,
    )
    .orderBy(
      sql`cast((cast(${issues.createdAt} as integer) / 86400) * 86400 as integer)`,
    );

  const [totalRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(gitCommits)
    .where(eq(gitCommits.repoId, repo.id));

  // Punchcard: commits grouped by day-of-week and hour-of-day
  // Unix epoch (1970-01-01) was a Thursday (day 4). ((ts/86400)+4)%7 gives 0=Sun..6=Sat
  const punchcardRows = await db
    .select({
      day: sql<number>`cast(((${gitCommits.authorTimestamp} / 86400) + 4) % 7 as integer)`,
      hour: sql<number>`cast((${gitCommits.authorTimestamp} % 86400) / 3600 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(and(...commitConditions))
    .groupBy(
      sql`cast(((${gitCommits.authorTimestamp} / 86400) + 4) % 7 as integer)`,
      sql`cast((${gitCommits.authorTimestamp} % 86400) / 3600 as integer)`,
    );

  // File change frequency: weekly counts grouped by changeType
  const fileChangeConditions = [
    eq(gitCommitFiles.repoId, repo.id),
    sql`${gitCommits.authorTimestamp} >= ${oneYearAgo}`,
    ...(authorEmail ? [eq(gitCommits.authorEmail, authorEmail)] : []),
  ];
  const fileChangeRows = await db
    .select({
      week: sql<number>`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
      changeType: gitCommitFiles.changeType,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommitFiles)
    .innerJoin(
      gitCommits,
      and(
        eq(gitCommitFiles.repoId, gitCommits.repoId),
        eq(gitCommitFiles.commitOid, gitCommits.oid),
      ),
    )
    .where(and(...fileChangeConditions))
    .groupBy(
      sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
      gitCommitFiles.changeType,
    )
    .orderBy(
      sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
    );

  // Aggregate file changes into {week, additions, modifications, deletions}
  const fileFreqMap = new Map<number, { additions: number; modifications: number; deletions: number }>();
  for (const r of fileChangeRows) {
    const entry = fileFreqMap.get(r.week) || { additions: 0, modifications: 0, deletions: 0 };
    if (r.changeType === "add") entry.additions += r.count;
    else if (r.changeType === "modify") entry.modifications += r.count;
    else if (r.changeType === "delete") entry.deletions += r.count;
    else if (r.changeType === "rename") entry.modifications += r.count;
    fileFreqMap.set(r.week, entry);
  }
  const fileFrequency = Array.from(fileFreqMap.entries())
    .map(([week, counts]) => ({ week, ...counts }))
    .sort((a, b) => a.week - b.week);

  // Language breakdown: reuse LANGUAGE_MAP for proper language names
  const defaultRef = await db
    .select({ commitOid: gitRefs.commitOid })
    .from(gitRefs)
    .where(
      and(
        eq(gitRefs.repoId, repo.id),
        eq(gitRefs.name, repo.defaultBranch),
      ),
    )
    .limit(1);

  let languages: { language: string; count: number; percentage: number }[] = [];
  if (defaultRef.length > 0) {
    const headCommit = await db
      .select({ treeOid: gitCommits.treeOid })
      .from(gitCommits)
      .where(
        and(
          eq(gitCommits.repoId, repo.id),
          eq(gitCommits.oid, defaultRef[0].commitOid),
        ),
      )
      .limit(1);

    if (headCommit.length > 0) {
      const blobs = await db
        .select({ name: gitTreeEntries.entryName })
        .from(gitTreeEntries)
        .where(
          and(
            eq(gitTreeEntries.repoId, repo.id),
            eq(gitTreeEntries.rootTreeOid, headCommit[0].treeOid),
            eq(gitTreeEntries.entryType, "blob"),
          ),
        );

      const langCounts = new Map<string, number>();
      let totalFiles = 0;
      for (const blob of blobs) {
        const ext = blob.name.split(".").pop()?.toLowerCase();
        if (!ext) continue;
        const lang = LANGUAGE_MAP[ext];
        if (!lang) continue;
        langCounts.set(lang.name, (langCounts.get(lang.name) || 0) + 1);
        totalFiles++;
      }

      languages = [...langCounts.entries()]
        .map(([language, count]) => ({
          language,
          count,
          percentage: totalFiles > 0 ? Math.round((count / totalFiles) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    }
  }

  // Contributor timeline: per-author weekly commits (top 10)
  const timelineRows = await db
    .select({
      email: gitCommits.authorEmail,
      name: gitCommits.authorName,
      week: sql<number>`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(gitCommits)
    .where(and(...commitConditions))
    .groupBy(
      gitCommits.authorEmail,
      sql`cast((${gitCommits.authorTimestamp} / 604800) * 604800 as integer)`,
    );

  // Group by author, keep top 10 by total commits
  const authorMap = new Map<string, { name: string; weeks: Map<number, number>; total: number }>();
  for (const r of timelineRows) {
    let entry = authorMap.get(r.email);
    if (!entry) {
      entry = { name: r.name, weeks: new Map(), total: 0 };
      authorMap.set(r.email, entry);
    }
    entry.weeks.set(r.week, (entry.weeks.get(r.week) || 0) + r.count);
    entry.total += r.count;
  }
  const contributorTimeline = Array.from(authorMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([email, data]) => ({
      email,
      name: data.name,
      weeks: Array.from(data.weeks.entries())
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week - b.week),
    }));

  // Merge all daily activity into a single map keyed by UTC day start
  const activityMap = new Map<number, { commits: number; prs: number; issues: number }>();
  for (const r of dailyRows) {
    const entry = activityMap.get(r.day) || { commits: 0, prs: 0, issues: 0 };
    entry.commits += r.count;
    activityMap.set(r.day, entry);
  }
  for (const r of dailyPRRows) {
    const entry = activityMap.get(r.day) || { commits: 0, prs: 0, issues: 0 };
    entry.prs += r.count;
    activityMap.set(r.day, entry);
  }
  for (const r of dailyIssueRows) {
    const entry = activityMap.get(r.day) || { commits: 0, prs: 0, issues: 0 };
    entry.issues += r.count;
    activityMap.set(r.day, entry);
  }

  const daily = Array.from(activityMap.entries())
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day - b.day);

  return {
    daily,
    weekly: weeklyRows,
    contributors,
    totalCommits: totalRow?.count || 0,
    punchcard: punchcardRows,
    fileFrequency,
    languages,
    contributorTimeline,
    defaultBranch: repo.defaultBranch,
  };
}

export async function getRepoAuditLogs(
  ownerName: string,
  repoName: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  if (user.username !== ownerName) return { error: "Forbidden" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, user.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return { error: "Repository not found" };

  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;

  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      username: users.username,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.userId))
    .where(
      and(
        eq(auditLogs.targetType, "repository"),
        eq(auditLogs.targetId, repo.id),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const serializedLogs = logs.map((log) => ({
    ...log,
    createdAt:
      log.createdAt instanceof Date
        ? log.createdAt.toISOString()
        : log.createdAt,
  }));

  return { logs: serializedLogs };
}

// --- Mutation Functions ---

export async function createRepo(
  name: string,
  description: string,
  isPublic: boolean = true,
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };

  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return {
      error:
        "Invalid repository name. Use alphanumeric characters, dots, hyphens, and underscores.",
    };
  }

  const [existing] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, user.id), eq(repositories.name, name)))
    .limit(1);

  if (existing) return { error: "Repository already exists" };

  const diskPath = path.resolve(DATA_DIR, user.username, `${name}.git`);
  await initBareRepo(diskPath);

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(repositories).values({
    id,
    ownerId: user.id,
    name,
    description: description || null,
    isPublic,
    diskPath,
    createdAt: now,
    updatedAt: now,
  });

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "repo.create",
    targetType: "repository",
    targetId: id,
    metadata: { name, isPublic },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return {
    repository: { id, name, description, isPublic, owner: user.username },
  };
}

export async function updateRepo(
  ownerName: string,
  repoName: string,
  updates: { description?: string; isPublic?: boolean; defaultBranch?: string },
) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.username !== ownerName) return { error: "Forbidden" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, user.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return { error: "Repository not found" };

  const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof updates.description === "string")
    dbUpdates.description = updates.description || null;
  if (typeof updates.isPublic === "boolean")
    dbUpdates.isPublic = updates.isPublic;
  if (typeof updates.defaultBranch === "string" && updates.defaultBranch)
    dbUpdates.defaultBranch = updates.defaultBranch;

  await db
    .update(repositories)
    .set(dbUpdates)
    .where(eq(repositories.id, repo.id));

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "repo.update",
    targetType: "repository",
    targetId: repo.id,
    metadata: dbUpdates,
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  const [updated] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, repo.id))
    .limit(1);
  return {
    repository: {
      ...updated,
      owner: ownerName,
      createdAt:
        updated.createdAt instanceof Date
          ? updated.createdAt.toISOString()
          : updated.createdAt,
      updatedAt:
        updated.updatedAt instanceof Date
          ? updated.updatedAt.toISOString()
          : updated.updatedAt,
    },
  };
}

export async function deleteRepo(ownerName: string, repoName: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" };
  if (user.username !== ownerName) return { error: "Forbidden" };

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, user.id), eq(repositories.name, repoName)),
    )
    .limit(1);

  if (!repo) return { error: "Repository not found" };

  await db.delete(repositories).where(eq(repositories.id, repo.id));

  const { rm } = await import("node:fs/promises");
  try {
    await rm(repo.diskPath, { recursive: true, force: true });
  } catch {
    // Best effort
  }

  const req = getRequest();
  logAudit({
    userId: user.id,
    action: "repo.delete",
    targetType: "repository",
    targetId: repo.id,
    metadata: { name: repoName },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}
