import {
  db,
  gitRefs,
  gitCommits,
  gitCommitAncestry,
  gitTreeEntries,
  gitBlobs,
  gitCommitFiles,
} from "@groffee/db";
import { eq, and, sql } from "drizzle-orm";
import {
  walkTree,
  readBlobForIndex,
  getChangedFiles,
  readCommitForIndex,
  getCommitParents,
  listAllRefsWithOids,
  snapshotRefs,
  diffRefSnapshots,
  walkAncestry,
} from "@groffee/git";

/**
 * Index a single commit: metadata, tree entries, blobs, changed files.
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

    // Index blobs that we haven't seen yet
    const blobEntries = walked.entries.filter((e) => e.entryType === "blob");
    for (const entry of blobEntries) {
      const [existingBlob] = await db
        .select({ id: gitBlobs.id })
        .from(gitBlobs)
        .where(and(eq(gitBlobs.repoId, repoId), eq(gitBlobs.oid, entry.entryOid)))
        .limit(1);

      if (!existingBlob) {
        const blobData = await readBlobForIndex(repoPath, entry.entryOid);
        await db
          .insert(gitBlobs)
          .values({
            id: crypto.randomUUID(),
            repoId,
            oid: entry.entryOid,
            content: blobData.content,
            size: blobData.size,
            isBinary: blobData.isBinary,
            isTruncated: blobData.isTruncated,
          })
          .onConflictDoNothing();

        // Index into FTS5 for code search (text files only)
        if (blobData.content && !blobData.isBinary) {
          try {
            db.run(
              sql`INSERT OR REPLACE INTO code_search(repo_id, blob_oid, file_path, content) VALUES (${repoId}, ${entry.entryOid}, ${entry.entryPath}, ${blobData.content})`,
            );
          } catch {
            // FTS5 insert failure is non-fatal
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

/**
 * Rebuild the commit ancestry table for a ref (first-parent chain with depth).
 */
async function rebuildAncestry(
  repoId: string,
  repoPath: string,
  refName: string,
  tipOid: string,
): Promise<void> {
  // Clear existing ancestry for this ref
  await db
    .delete(gitCommitAncestry)
    .where(and(eq(gitCommitAncestry.repoId, repoId), eq(gitCommitAncestry.refName, refName)));

  // Walk first-parent chain
  const chain = await walkAncestry(repoPath, tipOid);

  // Batch insert ancestry entries
  for (let i = 0; i < chain.length; i += 500) {
    const batch = chain.slice(i, i + 500).map((commitOid, j) => ({
      id: crypto.randomUUID(),
      repoId,
      refName,
      commitOid,
      depth: i + j,
    }));
    await db.insert(gitCommitAncestry).values(batch);
  }
}

/**
 * Index a single ref incrementally. Handles creates, updates, deletes, force pushes.
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
    await db
      .delete(gitRefs)
      .where(and(eq(gitRefs.repoId, repoId), eq(gitRefs.name, refName)));
    await db
      .delete(gitCommitAncestry)
      .where(and(eq(gitCommitAncestry.repoId, repoId), eq(gitCommitAncestry.refName, refName)));
    return;
  }

  // Walk new commits: from tip backwards, stop when we find already-indexed commits
  const newCommitOids: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [newOid];

  while (queue.length > 0) {
    const oid = queue.shift()!;
    if (visited.has(oid)) continue;
    visited.add(oid);

    // Already indexed?
    const [existing] = await db
      .select({ id: gitCommits.id })
      .from(gitCommits)
      .where(and(eq(gitCommits.repoId, repoId), eq(gitCommits.oid, oid)))
      .limit(1);
    if (existing) continue;

    newCommitOids.push(oid);

    // Enqueue parents
    try {
      const parents = await getCommitParents(repoPath, oid);
      for (const parent of parents) {
        if (!visited.has(parent)) queue.push(parent);
      }
    } catch {
      break;
    }
  }

  // Index new commits oldest-first
  for (const oid of newCommitOids.reverse()) {
    await indexCommit(repoId, repoPath, oid);
  }

  // Upsert ref
  const now = new Date();
  const [existingRef] = await db
    .select()
    .from(gitRefs)
    .where(and(eq(gitRefs.repoId, repoId), eq(gitRefs.name, refName)))
    .limit(1);

  if (existingRef) {
    await db
      .update(gitRefs)
      .set({ commitOid: newOid, type: refType, updatedAt: now })
      .where(eq(gitRefs.id, existingRef.id));
  } else {
    await db.insert(gitRefs).values({
      id: crypto.randomUUID(),
      repoId,
      name: refName,
      type: refType,
      commitOid: newOid,
      updatedAt: now,
    });
  }

  // Rebuild ancestry for this ref
  await rebuildAncestry(repoId, repoPath, refName, newOid);
}

/**
 * Full reindex: clear all indexed data for a repo and re-index all refs.
 */
export async function fullReindex(repoId: string, repoPath: string): Promise<void> {
  // Clear all indexed data
  await db.delete(gitRefs).where(eq(gitRefs.repoId, repoId));
  await db.delete(gitCommits).where(eq(gitCommits.repoId, repoId));
  await db.delete(gitTreeEntries).where(eq(gitTreeEntries.repoId, repoId));
  await db.delete(gitBlobs).where(eq(gitBlobs.repoId, repoId));
  await db.delete(gitCommitFiles).where(eq(gitCommitFiles.repoId, repoId));
  await db.delete(gitCommitAncestry).where(eq(gitCommitAncestry.repoId, repoId));

  // Clear FTS5
  try {
    db.run(sql`DELETE FROM code_search WHERE repo_id = ${repoId}`);
  } catch {
    // FTS5 table might not exist yet
  }

  // List all refs from git
  try {
    const refs = await listAllRefsWithOids(repoPath);
    for (const ref of refs) {
      await indexRef(repoId, repoPath, ref.name, ref.type, null, ref.oid);
    }
  } catch {
    // Empty repo
  }
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
}
