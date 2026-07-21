import { db, pipelineRuns, pipelineJobs, pipelineSteps } from "@groffee/db";
import { eq, and, inArray } from "drizzle-orm";
import { executeRun } from "./pipeline-runner.js";
import { logBackgroundError, logger, errorMetadata } from "./logger.js";
import { interpolateTemplate } from "./pipeline-config.js";

const logQueueError = logBackgroundError("Pipeline queue operation failed", "pipeline-queue");

const MAX_CONCURRENT_RUNS = parseInt(process.env.PIPELINE_MAX_CONCURRENT || "2", 10);

// Default run-level timeout if the YAML config omits one.
const DEFAULT_RUN_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

// Sweeper cadence + grace period beyond the run timeout before we declare it
// stuck and mark it timed_out. The grace lets a soft abort run its course first.
const SWEEP_INTERVAL_MS = 60 * 1000;
const SWEEP_GRACE_MS = 5 * 60 * 1000;

interface QueueEntry {
  runId: string;
  repoId: string;
  concurrencyGroup?: string;
  cancelInProgress?: boolean;
}

interface ActiveRun {
  runId: string;
  concurrencyGroup?: string;
  abort: AbortController;
  timeoutHandle: NodeJS.Timeout;
}

const queue: QueueEntry[] = [];
const activeRuns = new Map<string, ActiveRun>();
let processing = false;

export function enqueueRun(entry: QueueEntry): void {
  // Handle concurrency groups
  if (entry.concurrencyGroup && entry.cancelInProgress) {
    // Cancel any active run in the same group
    for (const active of activeRuns.values()) {
      if (active.concurrencyGroup === entry.concurrencyGroup) {
        active.abort.abort();
        clearTimeout(active.timeoutHandle);
        cancelRunInDb(active.runId).catch(logQueueError);
      }
    }
    // Remove queued entries in the same group
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].concurrencyGroup === entry.concurrencyGroup) {
        cancelRunInDb(queue[i].runId).catch(logQueueError);
        queue.splice(i, 1);
      }
    }
  }

  queue.push(entry);
  processQueue().catch(logQueueError);
}

function getRunTimeoutMs(configSnapshot: string): number {
  try {
    const cfg = JSON.parse(configSnapshot) as { timeout?: number };
    if (typeof cfg.timeout === "number" && cfg.timeout > 0) {
      return cfg.timeout * 1000;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_RUN_TIMEOUT_MS;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0 && activeRuns.size < MAX_CONCURRENT_RUNS) {
      const entry = queue.shift()!;

      // Check if run was cancelled while queued, and load config for timeout
      const [run] = await db
        .select({ status: pipelineRuns.status, configSnapshot: pipelineRuns.configSnapshot })
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, entry.runId))
        .limit(1);
      if (!run || run.status === "cancelled") continue;

      const abort = new AbortController();
      // Per-run hard timeout. Aborts with reason "timeout" so the runner can
      // distinguish from user cancellation when writing the terminal status.
      const timeoutMs = getRunTimeoutMs(run.configSnapshot);
      const timeoutHandle = setTimeout(() => {
        abort.abort(new Error("timeout"));
      }, timeoutMs);
      // Allow process exit even if the timer is still pending.
      timeoutHandle.unref?.();

      activeRuns.set(entry.runId, {
        runId: entry.runId,
        concurrencyGroup: entry.concurrencyGroup,
        abort,
        timeoutHandle,
      });

      // Run in background — don't await
      executeRun(entry.runId, abort.signal)
        .catch((err) =>
          logger.error(`Pipeline run ${entry.runId} failed`, {
            source: "pipeline-queue",
            metadata: { runId: entry.runId, ...errorMetadata(err) },
          }),
        )
        .finally(() => {
          clearTimeout(timeoutHandle);
          activeRuns.delete(entry.runId);
          // Process next in queue
          processQueue().catch(logQueueError);
        });
    }
  } finally {
    processing = false;
  }
}

async function cancelRunInDb(runId: string): Promise<void> {
  const now = new Date();
  await db
    .update(pipelineRuns)
    .set({ status: "cancelled", finishedAt: now })
    .where(eq(pipelineRuns.id, runId));
  await db
    .update(pipelineJobs)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(pipelineJobs.runId, runId), eq(pipelineJobs.status, "queued")));
  const jobs = await db
    .select({ id: pipelineJobs.id })
    .from(pipelineJobs)
    .where(eq(pipelineJobs.runId, runId));
  if (jobs.length > 0) {
    await db
      .update(pipelineSteps)
      .set({ status: "cancelled", finishedAt: now })
      .where(
        and(
          inArray(
            pipelineSteps.jobId,
            jobs.map((job) => job.id),
          ),
          eq(pipelineSteps.status, "queued"),
        ),
      );
  }
}

export async function cancelRun(runId: string): Promise<void> {
  // Cancel if active
  for (const active of activeRuns.values()) {
    if (active.runId === runId) {
      active.abort.abort();
      clearTimeout(active.timeoutHandle);
      break;
    }
  }
  // Cancel in DB
  await cancelRunInDb(runId);
  // Lifecycle operations (rename/delete) need the workspace/container to be
  // released before moving or removing repository storage.
  const deadline = Date.now() + 15_000;
  while (activeRuns.has(runId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (activeRuns.has(runId)) {
    throw new Error(`Pipeline run ${runId} did not stop within 15 seconds`);
  }
}

export function getQueueStatus(): { queued: number; active: number } {
  return { queued: queue.length, active: activeRuns.size };
}

/**
 * Periodically sweeps runs whose status is still "running" but whose process
 * died without writing a terminal status (server restart, crash, OOM kill).
 *
 * Compares startedAt + run-timeout + grace period against the current time;
 * if exceeded AND the run is not in our in-memory active set, mark it
 * `timed_out` so the UI stops claiming the run is in progress.
 */
async function sweepStuckRuns(): Promise<void> {
  // Find candidates: status=running. Drizzle's `lt` would let us push the
  // deadline into SQL, but the timeout is per-run (config-derived), so we do
  // the math in JS over a small candidate set.
  const candidates = await db
    .select({
      id: pipelineRuns.id,
      startedAt: pipelineRuns.startedAt,
      configSnapshot: pipelineRuns.configSnapshot,
    })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.status, "running"));

  const now = Date.now();
  for (const run of candidates) {
    // Skip if currently tracked — its own timeout handle will fire first.
    let tracked = false;
    for (const active of activeRuns.values()) {
      if (active.runId === run.id) {
        tracked = true;
        break;
      }
    }
    if (tracked) continue;

    const startedAt = run.startedAt instanceof Date ? run.startedAt.getTime() : null;
    if (startedAt === null) continue;

    const deadline = startedAt + getRunTimeoutMs(run.configSnapshot) + SWEEP_GRACE_MS;
    if (now < deadline) continue;

    const finishedAt = new Date(now);
    await db
      .update(pipelineRuns)
      .set({ status: "timed_out", finishedAt })
      .where(eq(pipelineRuns.id, run.id));
    await db
      .update(pipelineJobs)
      .set({ status: "timed_out", finishedAt })
      .where(and(eq(pipelineJobs.runId, run.id), eq(pipelineJobs.status, "running")));
    const jobs = await db
      .select({ id: pipelineJobs.id })
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, run.id));
    if (jobs.length > 0) {
      await db
        .update(pipelineSteps)
        .set({ status: "cancelled", finishedAt })
        .where(
          and(
            inArray(
              pipelineSteps.jobId,
              jobs.map((job) => job.id),
            ),
            eq(pipelineSteps.status, "running"),
          ),
        );
    }
    logger.warn("Swept stuck pipeline run", {
      source: "pipeline-queue",
      metadata: { runId: run.id, status: "timed_out" },
    });
  }
}

async function recoverInterruptedRuns(): Promise<void> {
  const interrupted = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.status, "running"));
  const finishedAt = new Date();
  for (const run of interrupted) {
    await db
      .update(pipelineRuns)
      .set({ status: "timed_out", finishedAt })
      .where(eq(pipelineRuns.id, run.id));
    await db
      .update(pipelineJobs)
      .set({ status: "timed_out", finishedAt })
      .where(and(eq(pipelineJobs.runId, run.id), eq(pipelineJobs.status, "running")));
    const jobs = await db
      .select({ id: pipelineJobs.id })
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, run.id));
    if (jobs.length > 0) {
      await db
        .update(pipelineSteps)
        .set({ status: "cancelled", finishedAt })
        .where(
          and(
            inArray(
              pipelineSteps.jobId,
              jobs.map((job) => job.id),
            ),
            eq(pipelineSteps.status, "running"),
          ),
        );
    }
    logger.warn("Recovered interrupted pipeline run", {
      source: "pipeline-queue",
      metadata: { runId: run.id, status: "timed_out" },
    });
  }
}

let _sweeperStarted = false;
export function startStuckRunSweeper(): void {
  if (_sweeperStarted) return;
  _sweeperStarted = true;
  recoverInterruptedRuns().catch(
    logBackgroundError("Interrupted pipeline recovery failed", "pipeline-queue"),
  );
  // Rehydrate work that was accepted before a clean or unclean restart.
  // DB status is the durable queue; the in-memory array is only a dispatcher.
  db.select({
    id: pipelineRuns.id,
    repoId: pipelineRuns.repoId,
    ref: pipelineRuns.ref,
    pipelineName: pipelineRuns.pipelineName,
    configSnapshot: pipelineRuns.configSnapshot,
  })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.status, "queued"))
    .orderBy(pipelineRuns.createdAt)
    .then((runs) => {
      for (const run of runs) {
        let concurrencyGroup: string | undefined;
        let cancelInProgress = false;
        try {
          const config = JSON.parse(run.configSnapshot) as {
            concurrency?: { group: string; cancel_in_progress?: boolean };
          };
          if (config.concurrency) {
            concurrencyGroup = interpolateTemplate(config.concurrency.group, {
              ref: run.ref,
              pipeline: run.pipelineName,
            });
            cancelInProgress = Boolean(config.concurrency.cancel_in_progress);
          }
        } catch {
          // The runner will surface an invalid snapshot as a failed run.
        }
        enqueueRun({ runId: run.id, repoId: run.repoId, concurrencyGroup, cancelInProgress });
      }
    })
    .catch(logBackgroundError("Queued pipeline recovery failed", "pipeline-queue"));
  // Run once shortly after boot to catch runs that died with the previous
  // process, then on a steady cadence.
  setTimeout(() => {
    sweepStuckRuns().catch(
      logBackgroundError("Initial stuck pipeline sweep failed", "pipeline-queue"),
    );
  }, 5_000).unref?.();
  setInterval(() => {
    sweepStuckRuns().catch(logBackgroundError("Stuck pipeline sweep failed", "pipeline-queue"));
  }, SWEEP_INTERVAL_MS).unref?.();
}
