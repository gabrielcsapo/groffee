import { db, pipelineRuns, pipelineJobs, pipelineSteps } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { executeRun } from "./pipeline-runner.js";

const MAX_CONCURRENT_RUNS = parseInt(process.env.PIPELINE_MAX_CONCURRENT || "2", 10);

interface QueueEntry {
  runId: string;
  repoId: string;
  concurrencyGroup?: string;
  cancelInProgress?: boolean;
}

const queue: QueueEntry[] = [];
const activeRuns = new Map<string, { runId: string; abort: AbortController }>();
let processing = false;

export function enqueueRun(entry: QueueEntry): void {
  // Handle concurrency groups
  if (entry.concurrencyGroup && entry.cancelInProgress) {
    // Cancel any active run in the same group
    for (const [group, active] of activeRuns) {
      if (group === entry.concurrencyGroup) {
        active.abort.abort();
        cancelRunInDb(active.runId).catch(console.error);
      }
    }
    // Remove queued entries in the same group
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].concurrencyGroup === entry.concurrencyGroup) {
        cancelRunInDb(queue[i].runId).catch(console.error);
        queue.splice(i, 1);
      }
    }
  }

  queue.push(entry);
  processQueue().catch(console.error);
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0 && activeRuns.size < MAX_CONCURRENT_RUNS) {
      const entry = queue.shift()!;

      // Check if run was cancelled while queued
      const [run] = await db
        .select({ status: pipelineRuns.status })
        .from(pipelineRuns)
        .where(eq(pipelineRuns.id, entry.runId))
        .limit(1);
      if (!run || run.status === "cancelled") continue;

      const abort = new AbortController();
      const groupKey = entry.concurrencyGroup || entry.runId;
      activeRuns.set(groupKey, { runId: entry.runId, abort });

      // Run in background — don't await
      executeRun(entry.runId, abort.signal)
        .catch((err) => console.error(`Pipeline run ${entry.runId} failed:`, err))
        .finally(() => {
          activeRuns.delete(groupKey);
          // Process next in queue
          processQueue().catch(console.error);
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
  await db
    .update(pipelineSteps)
    .set({ status: "cancelled", finishedAt: now })
    .where(eq(pipelineSteps.status, "queued"));
}

export function cancelRun(runId: string): void {
  // Cancel if active
  for (const [group, active] of activeRuns) {
    if (active.runId === runId) {
      active.abort.abort();
      activeRuns.delete(group);
      break;
    }
  }
  // Cancel in DB
  cancelRunInDb(runId).catch(console.error);
}

export function getQueueStatus(): { queued: number; active: number } {
  return { queued: queue.length, active: activeRuns.size };
}
