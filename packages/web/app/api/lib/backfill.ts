import { db, repositories, gitRefs } from "@groffee/db";
import { eq, sql } from "drizzle-orm";
import { fullReindex } from "./indexer.js";
import { listAllRefsWithOids } from "@groffee/git";
import { resolveDiskPath } from "./paths.js";
import { errorMetadata, logger } from "./logger.js";

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
          logger.info("Backfilling repository index", {
            source: "backfill",
            metadata: { repoId: repo.id, repository: repo.name },
          });
          await fullReindex(repo.id, resolveDiskPath(repo.diskPath));
          logger.info("Repository index backfill complete", {
            source: "backfill",
            metadata: { repoId: repo.id, repository: repo.name },
          });
        }
      } catch (err) {
        logger.error("Repository index backfill failed", {
          source: "backfill",
          metadata: { repoId: repo.id, repository: repo.name, ...errorMetadata(err) },
        });
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
