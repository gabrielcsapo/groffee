import {
  db,
  gitRefs,
  gitCommits,
  gitCommitAncestry,
  gitTreeEntries,
  gitBlobs,
  gitCommitFiles,
} from "@groffee/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { invalidateActivityCache } from "./activity-cache.js";
import { parseLfsPointer } from "../../lib/lfs.js";
import {
  walkTree,
  readSmallBlobs,
  getChangedFiles,
  readCommitForIndex,
  listAllRefsWithOids,
  snapshotRefs,
  diffRefSnapshots,
  walkAncestry,
  invalidateHeadCache,
} from "@groffee/git";

const MAX_BLOB_SIZE = 256 * 1024; // 256KB for indexing

/**
 * Index a single commit: metadata, tree entries, blobs, changed files.
 * Uses batch queries to avoid N+1 patterns.
 */
async function indexCommit(repoId: string, repoPath: string, oid: string): Promise<void> {
  // Check if already indexed
  const [existing] = await db
    .select({ id: gitCommits.id })
    .from(gitCommits)
    .where(and(eq(gitCommits.repoId, repoId), eq(gitCommits.oid, oid)))
    .limit(1);
  if (existing) return;

  const meta = await readCommitForIndex(repoPath, oid);

  // Insert commit metadata
  await db
    .insert(gitCommits)
    .values({
      id: crypto.randomUUID(),
      repoId,
      oid: meta.oid,
      message: meta.message,
      authorName: meta.authorName,
      authorEmail: meta.authorEmail,
      authorTimestamp: meta.authorTimestamp,
      committerName: meta.committerName,
      committerEmail: meta.committerEmail,
      committerTimestamp: meta.committerTimestamp,
      parentOids: JSON.stringify(meta.parentOids),
      treeOid: meta.treeOid,
    })
    .onConflictDoNothing();

  // Index tree (skip if this treeOid is already indexed)
  const [existingTree] = await db
    .select({ id: gitTreeEntries.id })
    .from(gitTreeEntries)
    .where(and(eq(gitTreeEntries.repoId, repoId), eq(gitTreeEntries.rootTreeOid, meta.treeOid)))
    .limit(1);

  if (!existingTree) {
    const walked = await walkTree(repoPath, oid);

    // Batch insert tree entries (500 at a time to stay within SQLite param limits)
    for (let i = 0; i < walked.entries.length; i += 500) {
      const batch = walked.entries.slice(i, i + 500).map((e) => ({
        id: crypto.randomUUID(),
        repoId,
        rootTreeOid: walked.rootTreeOid,
        parentPath: e.parentPath,
        entryName: e.entryName,
        entryPath: e.entryPath,
        entryType: e.entryType,
        entryOid: e.entryOid,
        entrySize: null,
      }));
      await db.insert(gitTreeEntries).values(batch).onConflictDoNothing();
    }

    // Batch-check which blobs already exist instead of N individual queries
    const blobEntries = walked.entries.filter((e) => e.entryType === "blob");
    if (blobEntries.length > 0) {
      const allBlobOids = [...new Set(blobEntries.map((e) => e.entryOid))];

      // Batch lookup existing blob OIDs
      const existingBlobOids = new Set<string>();
      for (let i = 0; i < allBlobOids.length; i += 500) {
        const batch = allBlobOids.slice(i, i + 500);
        const rows = await db
          .select({ oid: gitBlobs.oid })
          .from(gitBlobs)
          .where(and(eq(gitBlobs.repoId, repoId), inArray(gitBlobs.oid, batch)));
        for (const row of rows) existingBlobOids.add(row.oid);
      }

      // Filter to only new blob OIDs
      const newBlobOids = allBlobOids.filter((oid) => !existingBlobOids.has(oid));

      if (newBlobOids.length > 0) {
        // Use batch blob reader (2 git subprocesses total instead of 2N)
        const blobContents = await readSmallBlobs(repoPath, newBlobOids, MAX_BLOB_SIZE);

        // Build a map from OID to entry path for FTS indexing
        const oidToPath = new Map<string, string>();
        for (const entry of blobEntries) {
          if (!oidToPath.has(entry.entryOid)) {
            oidToPath.set(entry.entryOid, entry.entryPath);
          }
        }

        for (const blobOid of newBlobOids) {
          const content = blobContents.get(blobOid);
          const isBinary = content ? isBinaryBuffer(content) : true;
          const textContent = content && !isBinary ? content.toString("utf-8") : null;
          const isLfs = textContent != null && parseLfsPointer(textContent) !== null;

          await db
            .insert(gitBlobs)
            .values({
              id: crypto.randomUUID(),
              repoId,
              oid: blobOid,
              content: textContent,
              size: content?.length ?? 0,
              isBinary,
              isTruncated: !content, // null content means it was too large
              isLfs,
            })
            .onConflictDoNothing();

          // Index into FTS5 for code search (text files only)
          if (textContent && !isBinary) {
            const filePath = oidToPath.get(blobOid);
            if (filePath) {
              try {
                db.run(
                  sql`INSERT OR REPLACE INTO code_search(repo_id, blob_oid, file_path, content) VALUES (${repoId}, ${blobOid}, ${filePath}, ${textContent})`,
                );
              } catch {
                // FTS5 insert failure is non-fatal
              }
            }
          }
        }
      }
    }
  }

  // Index changed files (for last-commit-per-path)
  const parentOid = meta.parentOids.length > 0 ? meta.parentOids[0] : null;
  const changedFiles = await getChangedFiles(repoPath, parentOid, oid);

  if (changedFiles.length > 0) {
    const allEntries: Array<{ path: string; changeType: "add" | "modify" | "delete" | "rename" }> =
      [];
    const dirsSeen = new Set<string>();

    for (const file of changedFiles) {
      allEntries.push(file);
      // Also record parent directories
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join("/");
        if (!dirsSeen.has(dirPath)) {
          dirsSeen.add(dirPath);
          allEntries.push({ path: dirPath, changeType: "modify" });
        }
      }
    }

    for (let i = 0; i < allEntries.length; i += 500) {
      const batch = allEntries.slice(i, i + 500).map((f) => ({
        id: crypto.randomUUID(),
        repoId,
        commitOid: oid,
        filePath: f.path,
        changeType: f.changeType,
      }));
      await db.insert(gitCommitFiles).values(batch).onConflictDoNothing();
    }
  }
}

/** Simple binary detection: check for null bytes in first 8KB */
function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Rebuild the commit ancestry table for a ref (first-parent chain with depth).
 * Wrapped in a transaction to prevent read inconsistency during rebuild.
 */
async function rebuildAncestry(
  repoId: string,
  repoPath: string,
  refName: string,
  tipOid: string,
): Promise<void> {
  // Walk first-parent chain (this is a git operation, do it outside the transaction)
  const chain = await walkAncestry(repoPath, tipOid);

  // Wrap delete + inserts in a single transaction for atomicity
  db.transaction((tx) => {
    // Clear existing ancestry for this ref
    tx.delete(gitCommitAncestry)
      .where(and(eq(gitCommitAncestry.repoId, repoId), eq(gitCommitAncestry.refName, refName)))
      .run();

    // Batch insert ancestry entries
    for (let i = 0; i < chain.length; i += 500) {
      const batch = chain.slice(i, i + 500).map((commitOid, j) => ({
        id: crypto.randomUUID(),
        repoId,
        refName,
        commitOid,
        depth: i + j,
      }));
      tx.insert(gitCommitAncestry).values(batch).run();
    }
  });
}

/**
 * Index a single ref incrementally. Handles creates, updates, deletes, force pushes.
 * Uses batch commit discovery to reduce N+1 queries.
 */
export async function indexRef(
  repoId: string,
  repoPath: string,
  refName: string,
  refType: "branch" | "tag",
  _oldOid: string | null,
  newOid: string | null,
): Promise<void> {
  // Handle ref deletion
  if (!newOid || newOid === "0000000000000000000000000000000000000000") {
    await db.delete(gitRefs).where(and(eq(gitRefs.repoId, repoId), eq(gitRefs.name, refName)));
    await db
      .delete(gitCommitAncestry)
      .where(and(eq(gitCommitAncestry.repoId, repoId), eq(gitCommitAncestry.refName, refName)));
    return;
  }

  // Upsert the ref FIRST so updatedAt reflects the actual push time even if
  // the heavier ancestry/commit indexing below fails or is skipped. This keeps
  // the landing-page "last activity" surface accurate independent of indexer
  // health.
  const now = new Date();
  await db
    .insert(gitRefs)
    .values({
      id: crypto.randomUUID(),
      repoId,
      name: refName,
      type: refType,
      commitOid: newOid,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [gitRefs.repoId, gitRefs.name],
      set: { commitOid: newOid, type: refType, updatedAt: now },
    });

  // Walk ancestry to discover all reachable commits, then batch-check which are new
  const allOids = await walkAncestry(repoPath, newOid);

  // Batch lookup which OIDs are already indexed
  const indexedOids = new Set<string>();
  for (let i = 0; i < allOids.length; i += 500) {
    const batch = allOids.slice(i, i + 500);
    const rows = await db
      .select({ oid: gitCommits.oid })
      .from(gitCommits)
      .where(and(eq(gitCommits.repoId, repoId), inArray(gitCommits.oid, batch)));
    for (const row of rows) indexedOids.add(row.oid);
  }

  // Find new commits (not yet indexed), preserve oldest-first order
  const newCommitOids = allOids.filter((oid) => !indexedOids.has(oid)).reverse();

  // Index new commits oldest-first
  for (const oid of newCommitOids) {
    await indexCommit(repoId, repoPath, oid);
  }

  // Rebuild ancestry for this ref
  await rebuildAncestry(repoId, repoPath, refName, newOid);
}

/**
 * Full reindex: clear all indexed data for a repo and re-index all refs.
 * Deletes are wrapped in a transaction for efficiency.
 */
export async function fullReindex(repoId: string, repoPath: string): Promise<void> {
  // Clear all indexed data in a single transaction
  db.transaction((tx) => {
    tx.delete(gitCommitAncestry).where(eq(gitCommitAncestry.repoId, repoId)).run();
    tx.delete(gitCommitFiles).where(eq(gitCommitFiles.repoId, repoId)).run();
    tx.delete(gitBlobs).where(eq(gitBlobs.repoId, repoId)).run();
    tx.delete(gitTreeEntries).where(eq(gitTreeEntries.repoId, repoId)).run();
    tx.delete(gitCommits).where(eq(gitCommits.repoId, repoId)).run();
    tx.delete(gitRefs).where(eq(gitRefs.repoId, repoId)).run();
  });

  // Clear FTS5
  try {
    db.run(sql`DELETE FROM code_search WHERE repo_id = ${repoId}`);
  } catch {
    // FTS5 table might not exist yet
  }

  // List all refs from git
  let refs: Awaited<ReturnType<typeof listAllRefsWithOids>>;
  try {
    refs = await listAllRefsWithOids(repoPath);
  } catch {
    // Empty repo — no refs to index
    await invalidateActivityCache(repoId).catch(() => {});
    return;
  }

  for (const ref of refs) {
    try {
      await indexRef(repoId, repoPath, ref.name, ref.type, null, ref.oid);
    } catch (err) {
      console.error(`fullReindex: failed to index ref ${ref.name} for repo ${repoId}:`, err);
    }
  }

  // Invalidate activity cache after full reindex
  await invalidateActivityCache(repoId).catch(() => {});
}

/**
 * Trigger incremental indexing after a push completes.
 * Compares ref snapshots to determine what changed.
 */
export async function triggerIncrementalIndex(
  repoId: string,
  repoPath: string,
  refsBefore: Map<string, string>,
): Promise<void> {
  // Small delay to ensure git has released locks
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Invalidate HEAD cache since refs may have changed
  invalidateHeadCache(repoPath);

  const refsAfter = await snapshotRefs(repoPath);
  const changes = diffRefSnapshots(refsBefore, refsAfter);

  if (changes.length === 0) return;

  for (const change of changes) {
    try {
      await indexRef(repoId, repoPath, change.name, change.type, change.oldOid, change.newOid);
    } catch (err) {
      console.error(`Failed to index ref ${change.name} for repo ${repoId}:`, err);
    }
  }

  // Invalidate activity cache after incremental index
  await invalidateActivityCache(repoId).catch(() => {});
}
