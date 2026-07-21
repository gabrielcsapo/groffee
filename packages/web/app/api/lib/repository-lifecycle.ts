import { db, lfsObjects, pipelineRuns, repositories } from "@groffee/db";
import { and, eq, ne } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { lfsObjectDiskPath } from "../../lib/lfs.js";
import {
  DATA_DIR,
  PAGES_DIR,
  PIPELINE_ARTIFACTS_DIR,
  PIPELINE_LOGS_DIR,
  PIPELINE_WORKSPACES_DIR,
  resolveDiskPath,
} from "./paths.js";
import { cancelRun } from "./pipeline-queue.js";

/** Remove every durable resource owned solely by a repository. */
export async function deleteRepositoryCompletely(repo: {
  id: string;
  diskPath: string;
  name: string;
  ownerName: string;
}): Promise<void> {
  const runs = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repoId, repo.id));
  const objects = await db
    .select({ oid: lfsObjects.oid })
    .from(lfsObjects)
    .where(eq(lfsObjects.repoId, repo.id));

  for (const run of runs) await cancelRun(run.id);

  const ownedPaths = [
    resolveDiskPath(repo.diskPath),
    resolve(PAGES_DIR, repo.ownerName, repo.name),
    ...runs.flatMap((run) => [
      resolve(PIPELINE_WORKSPACES_DIR, run.id),
      resolve(PIPELINE_LOGS_DIR, run.id),
      resolve(PIPELINE_ARTIFACTS_DIR, run.id),
    ]),
  ];
  await Promise.all(ownedPaths.map((path) => rm(path, { recursive: true, force: true })));

  await db.delete(repositories).where(eq(repositories.id, repo.id));

  // LFS blobs are content-addressed and may be referenced by another repo.
  for (const object of objects) {
    const [other] = await db
      .select({ oid: lfsObjects.oid })
      .from(lfsObjects)
      .where(and(eq(lfsObjects.oid, object.oid), ne(lfsObjects.repoId, repo.id)))
      .limit(1);
    if (!other) await rm(lfsObjectDiskPath(DATA_DIR, object.oid), { force: true });
  }
}
