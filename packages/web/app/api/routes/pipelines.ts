import { Hono } from "hono";
import {
  db,
  repositories,
  users,
  pipelineRuns,
  pipelineJobs,
  pipelineSteps,
  pipelineArtifacts,
} from "@groffee/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import { resolveDiskPath, PIPELINE_LOGS_DIR, PIPELINE_ARTIFACTS_DIR } from "../lib/paths.js";
import { triggerPipelines } from "../lib/pipeline-trigger.js";
import { cancelRun as cancelRunInQueue, getQueueStatus } from "../lib/pipeline-queue.js";
import { parsePipelineYaml } from "../lib/pipeline-config.js";
import {
  existsSync,
  readFileSync,
  statSync,
  createReadStream,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { parseLogBlob } from "../lib/ansi-to-html.js";
import { enqueueRun } from "../lib/pipeline-queue.js";
import { resolveJobOrder } from "../lib/pipeline-config.js";
import type { PipelineConfig } from "../lib/pipeline-config.js";

export const pipelineRoutes = new Hono();

// --- Helpers ---

async function findRepoForPipelines(ownerName: string, repoName: string, currentUserId?: string) {
  const [owner] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!owner) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, owner.id), eq(repositories.name, repoName)))
    .limit(1);
  if (!repo) return null;
  if (!repo.isPublic && currentUserId !== owner.id) return null;

  return { repo, owner };
}

// --- List pipeline runs ---
pipelineRoutes.get("/:owner/:repo/pipelines/runs", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPipelines(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let query = db
    .select()
    .from(pipelineRuns)
    .where(
      status
        ? and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.status, status as any))
        : eq(pipelineRuns.repoId, result.repo.id),
    )
    .orderBy(desc(pipelineRuns.number))
    .limit(limit)
    .offset(offset);

  const runs = await query;

  // Batch load triggeredBy users
  const userIds = [...new Set(runs.map((r) => r.triggeredById))];
  const triggeredByUsers =
    userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const userMap = new Map(triggeredByUsers.map((u) => [u.id, u.username]));

  const runsWithUsers = runs.map((r) => ({
    ...r,
    triggeredBy: userMap.get(r.triggeredById) || "unknown",
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  return c.json({ runs: runsWithUsers });
});

// --- Get single run detail ---
pipelineRoutes.get("/:owner/:repo/pipelines/runs/:runNumber", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPipelines(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const runNumber = parseInt(c.req.param("runNumber"), 10);
  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return c.json({ error: "Pipeline run not found" }, 404);

  // Load jobs
  const jobs = await db
    .select()
    .from(pipelineJobs)
    .where(eq(pipelineJobs.runId, run.id))
    .orderBy(pipelineJobs.sortOrder);

  // Load steps for all jobs
  const jobIds = jobs.map((j) => j.id);
  const steps =
    jobIds.length > 0
      ? await db
          .select()
          .from(pipelineSteps)
          .where(inArray(pipelineSteps.jobId, jobIds))
          .orderBy(pipelineSteps.sortOrder)
      : [];

  // Load artifacts
  const artifacts = await db
    .select()
    .from(pipelineArtifacts)
    .where(eq(pipelineArtifacts.runId, run.id));

  // Get triggered by user
  const [triggeredByUser] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, run.triggeredById))
    .limit(1);

  // Group steps by job
  const jobsWithSteps = jobs.map((job) => ({
    ...job,
    startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
    finishedAt: job.finishedAt instanceof Date ? job.finishedAt.toISOString() : job.finishedAt,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
    steps: steps
      .filter((s) => s.jobId === job.id)
      .map((s) => ({
        ...s,
        startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
        finishedAt: s.finishedAt instanceof Date ? s.finishedAt.toISOString() : s.finishedAt,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      })),
  }));

  return c.json({
    run: {
      ...run,
      triggeredBy: triggeredByUser?.username || "unknown",
      startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt,
      finishedAt: run.finishedAt instanceof Date ? run.finishedAt.toISOString() : run.finishedAt,
      createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : run.createdAt,
    },
    jobs: jobsWithSteps,
    artifacts: artifacts.map((a) => ({
      ...a,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    })),
  });
});

// --- Stream step logs (SSE) ---
//
// Live tail strategy:
//   - Track byte offset; per-tick read only [offset, EOF] via fs.read.
//   - Emit `event: append` with `{ lines: [{ ts, html }, ...] }` per chunk.
//   - Heartbeat every 15s ("event: ping") so proxies don't drop the conn.
//   - When step transitions to a terminal state, send any remaining bytes,
//     emit `event: end`, then close.
//   - Plain text mode (Accept != text/event-stream) returns the full log
//     unchanged for callers that want raw text (e.g. `curl`).
//   - JSON mode (?format=json) returns parsed `{ lines: [{ts, html}] }` for
//     the initial load on the run-detail page.
pipelineRoutes.get(
  "/:owner/:repo/pipelines/runs/:runNumber/jobs/:jobId/steps/:stepId/logs",
  optionalAuth,
  async (c) => {
    const currentUser = c.get("user") as { id: string } | undefined;
    const result = await findRepoForPipelines(
      c.req.param("owner"),
      c.req.param("repo"),
      currentUser?.id,
    );
    if (!result) return c.json({ error: "Repository not found" }, 404);

    const [step] = await db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.id, c.req.param("stepId")))
      .limit(1);
    if (!step || !step.logPath) return c.json({ error: "Step or logs not found" }, 404);

    // Find the run to get the runId for the log path
    const runNumber = parseInt(c.req.param("runNumber"), 10);
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
      .limit(1);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const logPath = resolve(PIPELINE_LOGS_DIR, run.id, step.logPath);
    if (!existsSync(logPath)) return c.json({ error: "Log file not found" }, 404);

    const accept = c.req.header("accept") || "";
    const format = c.req.query("format");

    if (accept.includes("text/event-stream")) {
      // Carry partial trailing line forward across ticks so we never split a
      // line at a chunk boundary (which would break ANSI state tracking and
      // produce a half-rendered "ts" prefix).
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let offset = 0;
          let pending = "";
          let closed = false;

          function safeEnqueue(s: string) {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(s));
            } catch {
              closed = true;
            }
          }

          function flushNew(): void {
            try {
              const stat = statSync(logPath);
              if (stat.size <= offset) return;

              // Read only the new bytes since last offset.
              const fd = openSync(logPath, "r");
              try {
                const len = stat.size - offset;
                const buf = Buffer.alloc(len);
                readSync(fd, buf, 0, len, offset);
                offset = stat.size;
                pending += buf.toString("utf-8");
              } finally {
                closeSync(fd);
              }

              // Only emit complete lines; carry the trailing partial.
              const lastNl = pending.lastIndexOf("\n");
              if (lastNl === -1) return;
              const completed = pending.slice(0, lastNl + 1);
              pending = pending.slice(lastNl + 1);

              const lines = parseLogBlob(completed);
              if (lines.length > 0) {
                safeEnqueue(`event: append\ndata: ${JSON.stringify({ lines })}\n\n`);
              }
            } catch {
              // Best effort — don't tear the stream down on transient read failures
            }
          }

          const heartbeat = setInterval(() => {
            safeEnqueue(`event: ping\ndata: ${Date.now()}\n\n`);
          }, 15_000);
          heartbeat.unref?.();

          let pollHandle: NodeJS.Timeout | null = null;

          async function tick(): Promise<void> {
            if (closed) return;
            flushNew();
            // Check terminal state.
            try {
              const [s] = await db
                .select({ status: pipelineSteps.status })
                .from(pipelineSteps)
                .where(eq(pipelineSteps.id, step.id))
                .limit(1);
              const terminal = !s || s.status !== "running";
              if (terminal) {
                // One last drain — including any final trailing partial line.
                flushNew();
                if (pending.length > 0) {
                  const lines = parseLogBlob(pending + "\n");
                  if (lines.length > 0) {
                    safeEnqueue(`event: append\ndata: ${JSON.stringify({ lines })}\n\n`);
                  }
                  pending = "";
                }
                safeEnqueue(
                  `event: end\ndata: ${JSON.stringify({ status: s?.status || "unknown" })}\n\n`,
                );
                clearInterval(heartbeat);
                if (pollHandle) clearTimeout(pollHandle);
                if (!closed) {
                  closed = true;
                  try {
                    controller.close();
                  } catch {
                    /* already closed */
                  }
                }
                return;
              }
            } catch {
              // DB blip — keep polling.
            }
            pollHandle = setTimeout(() => {
              tick().catch(() => {});
            }, 1000);
            pollHandle.unref?.();
          }

          c.req.raw.signal?.addEventListener(
            "abort",
            () => {
              closed = true;
              clearInterval(heartbeat);
              if (pollHandle) clearTimeout(pollHandle);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            },
            { once: true },
          );

          tick().catch(() => {});
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // JSON: parsed lines for the initial render in the UI.
    if (format === "json" || accept.includes("application/json")) {
      const content = readFileSync(logPath, "utf-8");
      return c.json({ lines: parseLogBlob(content), status: step.status });
    }

    // Plain text mode — return full log unchanged (raw, with timestamps + ANSI codes intact).
    const content = readFileSync(logPath, "utf-8");
    return new Response(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
);

// --- Download a single step's raw log file ---
pipelineRoutes.get(
  "/:owner/:repo/pipelines/runs/:runNumber/jobs/:jobId/steps/:stepId/log/download",
  optionalAuth,
  async (c) => {
    const currentUser = c.get("user") as { id: string } | undefined;
    const result = await findRepoForPipelines(
      c.req.param("owner"),
      c.req.param("repo"),
      currentUser?.id,
    );
    if (!result) return c.json({ error: "Repository not found" }, 404);

    const [step] = await db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.id, c.req.param("stepId")))
      .limit(1);
    if (!step || !step.logPath) return c.json({ error: "Step or logs not found" }, 404);

    const runNumber = parseInt(c.req.param("runNumber"), 10);
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
      .limit(1);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const logPath = resolve(PIPELINE_LOGS_DIR, run.id, step.logPath);
    if (!existsSync(logPath)) return c.json({ error: "Log file not found" }, 404);

    const safeStepName = step.name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60) || "step";
    const filename = `${result.repo.name}-run${run.number}-${safeStepName}.log`;
    // Stream the file rather than buffering — logs can be large.
    const nodeStream = createReadStream(logPath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer | string) => {
          controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
        });
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", () => controller.close());
      },
      cancel() {
        nodeStream.destroy();
      },
    });
    return new Response(webStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
);

// --- Download all logs for a run, concatenated with step headers ---
pipelineRoutes.get(
  "/:owner/:repo/pipelines/runs/:runNumber/log/download",
  optionalAuth,
  async (c) => {
    const currentUser = c.get("user") as { id: string } | undefined;
    const result = await findRepoForPipelines(
      c.req.param("owner"),
      c.req.param("repo"),
      currentUser?.id,
    );
    if (!result) return c.json({ error: "Repository not found" }, 404);

    const runNumber = parseInt(c.req.param("runNumber"), 10);
    const [run] = await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
      .limit(1);
    if (!run) return c.json({ error: "Run not found" }, 404);

    const jobs = await db
      .select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, run.id))
      .orderBy(pipelineJobs.sortOrder);
    const jobIds = jobs.map((j) => j.id);
    const steps =
      jobIds.length > 0
        ? await db
            .select()
            .from(pipelineSteps)
            .where(inArray(pipelineSteps.jobId, jobIds))
            .orderBy(pipelineSteps.sortOrder)
        : [];

    let body = `# Pipeline run #${run.number} (${run.pipelineName}) on ${run.ref}\n# commit: ${run.commitOid}\n# status: ${run.status}\n\n`;
    for (const job of jobs) {
      body += `\n========== JOB: ${job.name} (${job.status}) ==========\n\n`;
      const jobSteps = steps
        .filter((s) => s.jobId === job.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      for (const step of jobSteps) {
        body += `\n----- STEP: ${step.name} (${step.status}) -----\n`;
        if (step.logPath) {
          const stepLogPath = resolve(PIPELINE_LOGS_DIR, run.id, step.logPath);
          if (existsSync(stepLogPath)) {
            try {
              body += readFileSync(stepLogPath, "utf-8");
              if (!body.endsWith("\n")) body += "\n";
            } catch {
              body += "(failed to read log file)\n";
            }
          } else {
            body += "(no log file on disk)\n";
          }
        } else {
          body += "(no logs)\n";
        }
      }
    }

    const filename = `${result.repo.name}-run${run.number}.log`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
);

// --- Manual dispatch ---
pipelineRoutes.post("/:owner/:repo/pipelines/dispatch", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForPipelines(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  // Only owner and collaborators can dispatch
  if (user.id !== result.owner.id) {
    return c.json({ error: "Only repository owner can dispatch pipelines" }, 403);
  }

  const { ref, pipeline } = await c.req.json();
  if (!ref) return c.json({ error: "ref is required" }, 400);

  const diskPath = resolveDiskPath(result.repo.diskPath);

  // Resolve ref to commit
  let commitOid: string;
  try {
    commitOid = execFileSync("git", ["rev-parse", ref], {
      cwd: diskPath,
      timeout: 10_000,
      encoding: "utf-8",
    }).trim();
  } catch {
    return c.json({ error: `Could not resolve ref "${ref}"` }, 400);
  }

  const runIds = await triggerPipelines({
    repoId: result.repo.id,
    repoPath: diskPath,
    ref: `refs/heads/${ref}`,
    commitOid,
    trigger: "manual",
    triggeredById: user.id,
    pipelineName: pipeline,
  });

  if (runIds.length === 0) {
    return c.json({ error: "No matching pipelines found for manual trigger" }, 404);
  }

  return c.json({ runIds, message: `Triggered ${runIds.length} pipeline(s)` });
});

// --- Cancel run ---
pipelineRoutes.post("/:owner/:repo/pipelines/runs/:runNumber/cancel", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForPipelines(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);
  if (user.id !== result.owner.id) return c.json({ error: "Permission denied" }, 403);

  const runNumber = parseInt(c.req.param("runNumber"), 10);
  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return c.json({ error: "Run not found" }, 404);
  if (run.status !== "queued" && run.status !== "running") {
    return c.json({ error: "Run is not in a cancellable state" }, 400);
  }

  cancelRunInQueue(run.id);

  logAudit({
    userId: user.id,
    action: "pipeline.cancel",
    targetType: "pipeline_run",
    targetId: run.id,
    metadata: { runNumber },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ cancelled: true });
});

// --- Rerun only the failed jobs from an existing run ---
//
// Creates a NEW run row (so we have a clean number/audit trail) reusing the
// previous run's configSnapshot/ref/commitOid. Job rows are recreated for
// every job in the snapshot:
//   * jobs that previously failed/timed_out/were cancelled → status="queued"
//   * everything else → status="success" with the original timing copied
//     forward, so the DAG shows them as already done.
//
// The runner skips already-terminal jobs at execution time, so only the
// previously-failed jobs actually run.
pipelineRoutes.post(
  "/:owner/:repo/pipelines/runs/:runNumber/rerun-failed",
  requireAuth,
  async (c) => {
    const user = c.get("user") as { id: string; username: string };
    const result = await findRepoForPipelines(c.req.param("owner"), c.req.param("repo"), user.id);
    if (!result) return c.json({ error: "Repository not found" }, 404);
    if (user.id !== result.owner.id) return c.json({ error: "Permission denied" }, 403);

    const runNumber = parseInt(c.req.param("runNumber"), 10);
    const [originalRun] = await db
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
      .limit(1);
    if (!originalRun) return c.json({ error: "Run not found" }, 404);

    const failedStatuses = new Set(["failure", "timed_out", "cancelled"]);
    const originalJobs = await db
      .select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, originalRun.id))
      .orderBy(pipelineJobs.sortOrder);

    const hasFailed = originalJobs.some((j) => failedStatuses.has(j.status));
    if (!hasFailed) {
      return c.json({ error: "No failed jobs to rerun" }, 400);
    }

    const originalSteps =
      originalJobs.length > 0
        ? await db
            .select()
            .from(pipelineSteps)
            .where(
              inArray(
                pipelineSteps.jobId,
                originalJobs.map((j) => j.id),
              ),
            )
            .orderBy(pipelineSteps.sortOrder)
        : [];

    let configSnapshot: PipelineConfig;
    try {
      configSnapshot = JSON.parse(originalRun.configSnapshot);
    } catch {
      return c.json({ error: "Cannot parse original run's config snapshot" }, 500);
    }

    // Allocate next run number for this repo.
    const allRuns = await db
      .select({ number: pipelineRuns.number })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.repoId, result.repo.id))
      .orderBy(desc(pipelineRuns.number))
      .limit(1);
    const nextNumber = (allRuns[0]?.number || 0) + 1;

    const newRunId = crypto.randomUUID();
    const now = new Date();

    // Tag this run as a partial rerun in the snapshot's metadata so it shows
    // up clearly in audit logs / debugging. We round-trip through JSON to
    // avoid mutating the original config object.
    const taggedSnapshot = {
      ...configSnapshot,
      _rerun: {
        of: originalRun.number,
        partial: true,
        triggeredAt: now.toISOString(),
      },
    };

    await db.insert(pipelineRuns).values({
      id: newRunId,
      repoId: originalRun.repoId,
      pipelineName: originalRun.pipelineName,
      number: nextNumber,
      status: "queued",
      trigger: "manual",
      ref: originalRun.ref,
      commitOid: originalRun.commitOid,
      triggeredById: user.id,
      configSnapshot: JSON.stringify(taggedSnapshot),
      createdAt: now,
    });

    // Create job + step rows. Failed → queued (will rerun); others → success
    // with original timestamps so the DAG paints them as already done.
    const jobOrder = resolveJobOrder(configSnapshot.jobs);
    for (let jobIdx = 0; jobIdx < jobOrder.length; jobIdx++) {
      const jobKey = jobOrder[jobIdx];
      const jobConfig = configSnapshot.jobs[jobKey];
      const jobName = jobConfig.name || jobKey;
      const original = originalJobs.find((j) => j.name === jobName);
      const wasFailed = original ? failedStatuses.has(original.status) : true;
      const newJobId = crypto.randomUUID();

      await db.insert(pipelineJobs).values({
        id: newJobId,
        runId: newRunId,
        name: jobName,
        status: wasFailed ? "queued" : "success",
        sortOrder: jobIdx,
        startedAt: !wasFailed && original?.startedAt ? new Date(original.startedAt) : null,
        finishedAt: !wasFailed && original?.finishedAt ? new Date(original.finishedAt) : null,
        createdAt: now,
      });

      for (let stepIdx = 0; stepIdx < jobConfig.steps.length; stepIdx++) {
        const stepConfig = jobConfig.steps[stepIdx];
        const originalStep = original
          ? originalSteps.find((s) => s.jobId === original.id && s.sortOrder === stepIdx)
          : undefined;

        const stepStatus = wasFailed ? "queued" : "success";
        const stepStartedAt =
          !wasFailed && originalStep?.startedAt ? new Date(originalStep.startedAt) : null;
        const stepFinishedAt =
          !wasFailed && originalStep?.finishedAt ? new Date(originalStep.finishedAt) : null;
        const stepLogPath = !wasFailed ? (originalStep?.logPath ?? null) : null;

        await db.insert(pipelineSteps).values({
          id: crypto.randomUUID(),
          jobId: newJobId,
          name: stepConfig.name,
          command: stepConfig.run || null,
          uses: stepConfig.uses || null,
          withConfig: stepConfig.with ? JSON.stringify(stepConfig.with) : null,
          status: stepStatus,
          exitCode: !wasFailed ? 0 : null,
          startedAt: stepStartedAt,
          finishedAt: stepFinishedAt,
          logPath: stepLogPath,
          sortOrder: stepIdx,
          createdAt: now,
        });
      }
    }

    enqueueRun({ runId: newRunId, repoId: originalRun.repoId });

    logAudit({
      userId: user.id,
      action: "pipeline.rerun_failed",
      targetType: "pipeline_run",
      targetId: newRunId,
      metadata: { newRunNumber: nextNumber, originalRunNumber: originalRun.number },
      ipAddress: getClientIp(c.req.raw.headers),
    }).catch(console.error);

    return c.json({ runNumber: nextNumber, runId: newRunId });
  },
);

// --- Retry run ---
pipelineRoutes.post("/:owner/:repo/pipelines/runs/:runNumber/retry", requireAuth, async (c) => {
  const user = c.get("user") as { id: string; username: string };
  const result = await findRepoForPipelines(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);
  if (user.id !== result.owner.id) return c.json({ error: "Permission denied" }, 403);

  const runNumber = parseInt(c.req.param("runNumber"), 10);
  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return c.json({ error: "Run not found" }, 404);

  // Re-trigger the same pipeline with same config
  const runIds = await triggerPipelines({
    repoId: result.repo.id,
    repoPath: resolveDiskPath(result.repo.diskPath),
    ref: `refs/heads/${run.ref}`,
    commitOid: run.commitOid,
    trigger: run.trigger as "push" | "pull_request" | "manual",
    triggeredById: user.id,
    pipelineName: run.pipelineName,
  });

  return c.json({ runIds });
});

// --- Download artifact ---
pipelineRoutes.get(
  "/:owner/:repo/pipelines/artifacts/:artifactId/download",
  optionalAuth,
  async (c) => {
    const currentUser = c.get("user") as { id: string } | undefined;
    const result = await findRepoForPipelines(
      c.req.param("owner"),
      c.req.param("repo"),
      currentUser?.id,
    );
    if (!result) return c.json({ error: "Repository not found" }, 404);

    const [artifact] = await db
      .select()
      .from(pipelineArtifacts)
      .where(eq(pipelineArtifacts.id, c.req.param("artifactId")))
      .limit(1);
    if (!artifact) return c.json({ error: "Artifact not found" }, 404);

    const artifactPath = resolve(PIPELINE_ARTIFACTS_DIR, artifact.diskPath);
    if (!existsSync(artifactPath)) return c.json({ error: "Artifact files not found" }, 404);

    // For simplicity, tar.gz the artifact directory
    const { execFileSync } = await import("node:child_process");
    const tarContent = execFileSync("tar", ["-czf", "-", "-C", artifactPath, "."], {
      maxBuffer: 100 * 1024 * 1024,
    });

    return new Response(tarContent, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${artifact.name}.tar.gz"`,
      },
    });
  },
);

// --- Delete artifact (owner / write-perm only) ---
pipelineRoutes.delete("/:owner/:repo/pipelines/artifacts/:artifactId", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };
  const result = await findRepoForPipelines(c.req.param("owner"), c.req.param("repo"), user.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  // Owner-only for now (matches the rest of pipeline mutations in this file).
  // Collaborator support can come later when we expose write-perm globally.
  if (user.id !== result.owner.id) return c.json({ error: "Permission denied" }, 403);

  const [artifact] = await db
    .select()
    .from(pipelineArtifacts)
    .where(eq(pipelineArtifacts.id, c.req.param("artifactId")))
    .limit(1);
  if (!artifact) return c.json({ error: "Artifact not found" }, 404);

  // Defense in depth: confirm the artifact belongs to a run on this repo.
  const [run] = await db
    .select({ repoId: pipelineRuns.repoId })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, artifact.runId))
    .limit(1);
  if (!run || run.repoId !== result.repo.id) {
    return c.json({ error: "Artifact not found" }, 404);
  }

  const artifactPath = resolve(PIPELINE_ARTIFACTS_DIR, artifact.diskPath);
  try {
    const { rmSync, existsSync: ex } = await import("node:fs");
    if (ex(artifactPath)) {
      rmSync(artifactPath, { recursive: true, force: true });
    }
  } catch {
    // Best effort; we still drop the row so the UI clears.
  }
  await db.delete(pipelineArtifacts).where(eq(pipelineArtifacts.id, artifact.id));

  logAudit({
    userId: user.id,
    action: "pipeline.artifact_delete",
    targetType: "pipeline_artifact",
    targetId: artifact.id,
    metadata: { name: artifact.name, runId: artifact.runId },
    ipAddress: getClientIp(c.req.raw.headers),
  }).catch(console.error);

  return c.json({ deleted: true });
});

// --- Get pipeline config ---
pipelineRoutes.get("/:owner/:repo/pipelines/config", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPipelines(
    c.req.param("owner"),
    c.req.param("repo"),
    currentUser?.id,
  );
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const ref = c.req.query("ref") || result.repo.defaultBranch;
  const diskPath = resolveDiskPath(result.repo.diskPath);

  // Try to read from the repo
  let yamlContent: string;
  try {
    yamlContent = execFileSync("git", ["show", `${ref}:.groffee/pipelines.yml`], {
      cwd: diskPath,
      timeout: 10_000,
      encoding: "utf-8",
    });
  } catch {
    return c.json({ error: "No pipeline configuration found", yaml: null, config: null });
  }

  const { config, error } = parsePipelineYaml(yamlContent);
  return c.json({ yaml: yamlContent, config, error: error || null });
});

// --- Get queue status ---
pipelineRoutes.get("/:owner/:repo/pipelines/status", optionalAuth, async (c) => {
  return c.json(getQueueStatus());
});
