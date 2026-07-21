import { db, pipelineArtifacts } from "@groffee/db";
import { lt, isNotNull, and, eq } from "drizzle-orm";
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PIPELINE_ARTIFACTS_DIR } from "./paths.js";
import { errorMetadata, logBackgroundError, logger } from "./logger.js";

// Run every 30 minutes. The sweeper is best-effort; missing one cycle simply
// extends an artifact's life by ~30 min, which is acceptable for v1.
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
// First sweep runs shortly after process start so we don't wait 30 min on a
// fresh boot when there might already be expired artifacts on disk.
const SWEEP_INITIAL_DELAY_MS = 30 * 1000;

async function sweepExpiredArtifacts(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(pipelineArtifacts)
    .where(
      and(isNotNull(pipelineArtifacts.retentionUntil), lt(pipelineArtifacts.retentionUntil, now)),
    );

  for (const artifact of expired) {
    const diskPath = resolve(PIPELINE_ARTIFACTS_DIR, artifact.diskPath);
    try {
      if (existsSync(diskPath)) {
        rmSync(diskPath, { recursive: true, force: true });
      }
    } catch (err) {
      // If we can't delete the dir, leave the row alone so we'll retry next
      // cycle. Logging is sufficient here — alerting is a P1.
      logger.error("Failed to remove expired artifact directory", {
        source: "artifact-sweeper",
        metadata: { diskPath, artifactId: artifact.id, ...errorMetadata(err) },
      });
      continue;
    }
    try {
      await db.delete(pipelineArtifacts).where(eq(pipelineArtifacts.id, artifact.id));
    } catch (err) {
      logger.error("Failed to delete expired artifact record", {
        source: "artifact-sweeper",
        metadata: { artifactId: artifact.id, ...errorMetadata(err) },
      });
    }
  }

  if (expired.length > 0) {
    logger.info("Expired pipeline artifacts swept", {
      source: "artifact-sweeper",
      metadata: { count: expired.length },
    });
  }
}

let _sweeperStarted = false;
export function startArtifactRetentionSweeper(): void {
  if (_sweeperStarted) return;
  _sweeperStarted = true;
  setTimeout(() => {
    sweepExpiredArtifacts().catch(
      logBackgroundError("Initial artifact sweep failed", "artifact-sweeper"),
    );
  }, SWEEP_INITIAL_DELAY_MS).unref?.();
  setInterval(() => {
    sweepExpiredArtifacts().catch(logBackgroundError("Artifact sweep failed", "artifact-sweeper"));
  }, SWEEP_INTERVAL_MS).unref?.();
}
