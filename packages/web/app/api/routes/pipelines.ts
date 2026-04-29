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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

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

    if (accept.includes("text/event-stream")) {
      // SSE streaming for live logs
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let offset = 0;

          function sendChunk() {
            try {
              const content = readFileSync(logPath, "utf-8");
              if (content.length > offset) {
                const newContent = content.slice(offset);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(newContent)}\n\n`));
                offset = content.length;
              }

              // Check if step is still running
              db.select({ status: pipelineSteps.status })
                .from(pipelineSteps)
                .where(eq(pipelineSteps.id, step.id))
                .limit(1)
                .then(([s]) => {
                  if (!s || s.status !== "running") {
                    // Send final chunk and close
                    const finalContent = readFileSync(logPath, "utf-8");
                    if (finalContent.length > offset) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(finalContent.slice(offset))}\n\n`),
                      );
                    }
                    controller.enqueue(
                      encoder.encode(`event: done\ndata: ${s?.status || "unknown"}\n\n`),
                    );
                    controller.close();
                  } else {
                    setTimeout(sendChunk, 1000);
                  }
                })
                .catch(() => controller.close());
            } catch {
              controller.close();
            }
          }

          sendChunk();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Plain text mode — return full log
    const content = readFileSync(logPath, "utf-8");
    return new Response(content, {
      headers: { "Content-Type": "text/plain" },
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
