import { db, repositories, gitRefs, issues, pullRequests } from "@groffee/db";
import { eq, sql } from "drizzle-orm";
import { fullReindex } from "./indexer.js";
import { listAllRefsWithOids } from "@groffee/git";

/**
 * Backfill indexes for existing repos that haven't been indexed yet.
 * Also backfills FTS5 search tables for issues and PRs.
 * Called on server startup.
 */
export async function backfillIndexes(): Promise<void> {
  const allRepos = await db.select().from(repositories);

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
        const refs = await listAllRefsWithOids(repo.diskPath);
        if (refs.length > 0) {
          console.log(`Backfilling index for ${repo.name}...`);
          await fullReindex(repo.id, repo.diskPath);
          console.log(`Finished indexing ${repo.name}`);
        }
      } catch (err) {
        console.error(`Failed to index ${repo.name}:`, err);
      }
    }
  }

  // Backfill issue search FTS5
  const allIssues = await db.select().from(issues);
  for (const issue of allIssues) {
    try {
      db.run(
        sql`INSERT OR IGNORE INTO issue_search(issue_id, repo_id, title, body) VALUES (${issue.id}, ${issue.repoId}, ${issue.title}, ${issue.body || ""})`,
      );
    } catch {
      // Skip
    }
  }

  // Backfill PR search FTS5
  const allPRs = await db.select().from(pullRequests);
  for (const pr of allPRs) {
    try {
      db.run(
        sql`INSERT OR IGNORE INTO pr_search(pr_id, repo_id, title, body) VALUES (${pr.id}, ${pr.repoId}, ${pr.title}, ${pr.body || ""})`,
      );
    } catch {
      // Skip
    }
  }
}
