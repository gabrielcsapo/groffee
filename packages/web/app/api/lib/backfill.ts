import { db, repositories, gitRefs } from "@groffee/db";
import { eq, sql } from "drizzle-orm";
import { fullReindex } from "./indexer.js";
import { listAllRefsWithOids } from "@groffee/git";
import { resolveDiskPath } from "./paths.js";

/**
 * Backfill indexes for existing repos that haven't been indexed yet.
 * Also backfills FTS5 search tables for issues and PRs.
 * Called on server startup.
 */
export async function backfillIndexes(): Promise<void> {
  const allRepos = await db
    .select({ id: repositories.id, name: repositories.name, diskPath: repositories.diskPath })
    .from(repositories);

  for (const repo of allRepos) {
    // Check if this repo has any indexed refs
    const [existingRef] = await db
      .select({ id: gitRefs.id })
      .from(gitRefs)
      .where(eq(gitRefs.repoId, repo.id))
      .limit(1);

    if (!existingRef) {
      // Check if the repo actually has any branches
      try {
        const refs = await listAllRefsWithOids(resolveDiskPath(repo.diskPath));
        if (refs.length > 0) {
          console.log(`Backfilling index for ${repo.name}...`);
          await fullReindex(repo.id, resolveDiskPath(repo.diskPath));
          console.log(`Finished indexing ${repo.name}`);
        }
      } catch (err) {
        console.error(`Failed to index ${repo.name}:`, err);
      }
    }
  }

  // Backfill FTS5 tables using bulk SQL INSERT ... SELECT (no row-by-row loading)
  try {
    db.run(
      sql`INSERT OR IGNORE INTO issue_search(issue_id, repo_id, title, body) SELECT id, repo_id, title, COALESCE(body, '') FROM issues`,
    );
  } catch {
    // FTS5 table might not exist yet
  }

  try {
    db.run(
      sql`INSERT OR IGNORE INTO pr_search(pr_id, repo_id, title, body) SELECT id, repo_id, title, COALESCE(body, '') FROM pull_requests`,
    );
  } catch {
    // FTS5 table might not exist yet
  }
}
