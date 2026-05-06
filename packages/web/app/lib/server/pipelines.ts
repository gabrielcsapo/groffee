"use server";

import {
  db,
  pipelineRuns,
  pipelineJobs,
  pipelineSteps,
  pipelineArtifacts,
  repositories,
  users,
  clampLimit,
  cursorOrderBy,
  cursorWhere,
  paginatedResult,
} from "@groffee/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getSessionUser } from "./session.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { resolveDiskPath, PIPELINE_LOGS_DIR } from "../../api/lib/paths.js";
import {
  parsePipelineYaml,
  resolveJobOrder,
  expandMatrix,
  matrixCellLabel,
  type PipelineConfig,
  type MatrixValues,
} from "../../api/lib/pipeline-config.js";
import { triggerPipelines } from "../../api/lib/pipeline-trigger.js";
import { cancelRun as cancelRunInQueue, enqueueRun } from "../../api/lib/pipeline-queue.js";
import { parseLogBlob } from "../../api/lib/ansi-to-html.js";
import { resolveAnnotations, type LogAnnotation } from "../../api/lib/log-annotations.js";

async function findRepo(ownerName: string, repoName: string, currentUserId?: string) {
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

export async function getPipelineRuns(
  ownerName: string,
  repoName: string,
  status?: string,
  options: {
    cursor?: string | null;
    limit?: number;
    ref?: string;
    trigger?: "push" | "pull_request" | "manual";
    actor?: string;
  } = {},
) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" as string };

  const limit = clampLimit(options.limit);

  // Resolve actor username → user id once (we filter on triggeredById so
  // the index is hit; doing a join would force a more expensive plan).
  let actorUserId: string | null = null;
  if (options.actor) {
    const [actorRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, options.actor))
      .limit(1);
    if (!actorRow) {
      // Unknown actor → return empty page rather than 500.
      return { runs: [], nextCursor: null, hasMore: false };
    }
    actorUserId = actorRow.id;
  }

  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(
      and(
        eq(pipelineRuns.repoId, result.repo.id),
        status ? eq(pipelineRuns.status, status as any) : undefined,
        options.ref ? eq(pipelineRuns.ref, options.ref) : undefined,
        options.trigger ? eq(pipelineRuns.trigger, options.trigger) : undefined,
        actorUserId ? eq(pipelineRuns.triggeredById, actorUserId) : undefined,
        cursorWhere(options.cursor, pipelineRuns.createdAt, pipelineRuns.id, "desc"),
      ),
    )
    .orderBy(...cursorOrderBy(pipelineRuns.createdAt, pipelineRuns.id, "desc"))
    .limit(limit + 1);

  const userIds = [...new Set(runs.map((r) => r.triggeredById))];
  const triggeredByUsers =
    userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const userMap = new Map(triggeredByUsers.map((u) => [u.id, u.username]));

  const enriched = runs.map((r) => ({
    ...r,
    triggeredBy: userMap.get(r.triggeredById) || "unknown",
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  const page = paginatedResult(enriched, limit, "createdAt");
  return { runs: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

/**
 * Distinct refs and actors across this repo's pipeline runs, capped at 100
 * each, alphabetized. Used to populate the list page's filter dropdowns
 * without forcing the user to type a value blind. The cap is a guardrail
 * against repos with thousands of stale branches blowing up the dropdown.
 */
export async function getPipelineFilterFacets(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { refs: [], actors: [] };

  // Distinct ref + the latest run's createdAt per ref so we can sort by
  // recency (alphabetize within the cap is a fallback, but recency is more
  // useful for the dropdown).
  const refRows = await db
    .selectDistinct({ ref: pipelineRuns.ref })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repoId, result.repo.id))
    .limit(100);
  const refs = refRows.map((r) => r.ref).sort();

  // Distinct actor IDs → join with users to get usernames.
  const actorIdRows = await db
    .selectDistinct({ id: pipelineRuns.triggeredById })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repoId, result.repo.id))
    .limit(100);
  const actorIds = actorIdRows.map((r) => r.id);
  const actorRows =
    actorIds.length > 0
      ? await db.select({ username: users.username }).from(users).where(inArray(users.id, actorIds))
      : [];
  const actors = actorRows.map((a) => a.username).sort();

  return { refs, actors };
}

export async function getPipelineRunDetail(ownerName: string, repoName: string, runNumber: number) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return { error: "Run not found" };

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

  const artifacts = await db
    .select()
    .from(pipelineArtifacts)
    .where(eq(pipelineArtifacts.runId, run.id));

  const [triggeredByUser] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, run.triggeredById))
    .limit(1);

  const serializeDate = (d: Date | string | null) => (d instanceof Date ? d.toISOString() : d);

  // Parse configSnapshot to extract job dependencies (`needs`) so the UI
  // can render a DAG. Map jobConfig base name (= jobConfig.name || jobKey)
  // → needs[] of jobConfig base names. With matrix expansion, multiple DB
  // rows share the same base name; the client groups them into a single DAG
  // node and aggregates their statuses.
  const jobNeedsByBaseName: Map<string, string[]> = new Map();
  const jobImageByBaseName: Map<string, string | undefined> = new Map();
  try {
    const config = JSON.parse(run.configSnapshot) as {
      jobs?: Record<string, { name?: string; needs?: string[]; image?: string }>;
    };
    if (config.jobs) {
      const keyToBaseName = new Map<string, string>();
      for (const [key, jc] of Object.entries(config.jobs)) {
        keyToBaseName.set(key, jc.name || key);
      }
      for (const [key, jc] of Object.entries(config.jobs)) {
        const baseName = keyToBaseName.get(key)!;
        const resolvedNeeds = (jc.needs || []).map((dep) => keyToBaseName.get(dep) || dep);
        jobNeedsByBaseName.set(baseName, resolvedNeeds);
        jobImageByBaseName.set(baseName, jc.image);
      }
    }
  } catch {
    // Bad config snapshot; fall back to no DAG info
  }

  // Extract base name for a job row by stripping a trailing ` (...)` matrix
  // label (which our trigger always renders as `(k=v, k=v)`).
  function jobBaseName(displayName: string): string {
    const m = /^(.*) \([^)]+\)$/.exec(displayName);
    return m ? m[1] : displayName;
  }

  return {
    run: {
      ...run,
      triggeredBy: triggeredByUser?.username || "unknown",
      startedAt: serializeDate(run.startedAt),
      finishedAt: serializeDate(run.finishedAt),
      createdAt: serializeDate(run.createdAt),
    },
    jobs: jobs.map((job) => {
      const baseName = jobBaseName(job.name);
      let matrixValues: Record<string, string | number | boolean> | null = null;
      if (job.matrixValues) {
        try {
          matrixValues = JSON.parse(job.matrixValues);
        } catch {
          matrixValues = null;
        }
      }
      return {
        ...job,
        baseName,
        matrixValues,
        needs: jobNeedsByBaseName.get(baseName) || [],
        image: jobImageByBaseName.get(baseName),
        startedAt: serializeDate(job.startedAt),
        finishedAt: serializeDate(job.finishedAt),
        createdAt: serializeDate(job.createdAt),
        steps: steps
          .filter((s) => s.jobId === job.id)
          .map((s) => ({
            ...s,
            startedAt: serializeDate(s.startedAt),
            finishedAt: serializeDate(s.finishedAt),
            createdAt: serializeDate(s.createdAt),
          })),
      };
    }),
    artifacts: artifacts.map((a) => {
      const job = jobs.find((j) => j.id === a.jobId);
      return {
        id: a.id,
        runId: a.runId,
        jobId: a.jobId,
        jobName: job?.name || null,
        name: a.name,
        sizeBytes: a.sizeBytes,
        retentionUntil: serializeDate(a.retentionUntil),
        createdAt: serializeDate(a.createdAt),
      };
    }),
    isOwner: currentUser?.id === result.owner.id,
  };
}

/**
 * Delete a pipeline artifact (disk dir + DB row). Owner-only.
 *
 * Mirrors the existing DELETE API route — server actions get used by the
 * client component, the API route gets used by external scripts. Both go
 * through the same logAudit so the audit trail is consistent.
 */
export async function deleteArtifact(ownerName: string, repoName: string, artifactId: string) {
  const currentUser = await getSessionUser();
  if (!currentUser) return { error: "Unauthorized" };

  const result = await findRepo(ownerName, repoName, currentUser.id);
  if (!result) return { error: "Repository not found" };
  if (currentUser.id !== result.owner.id) return { error: "Permission denied" };

  const [artifact] = await db
    .select()
    .from(pipelineArtifacts)
    .where(eq(pipelineArtifacts.id, artifactId))
    .limit(1);
  if (!artifact) return { error: "Artifact not found" };

  const [run] = await db
    .select({ repoId: pipelineRuns.repoId })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, artifact.runId))
    .limit(1);
  if (!run || run.repoId !== result.repo.id) return { error: "Artifact not found" };

  const { resolve: resolvePath } = await import("node:path");
  const { rmSync, existsSync } = await import("node:fs");
  const { PIPELINE_ARTIFACTS_DIR } = await import("../../api/lib/paths.js");
  const diskPath = resolvePath(PIPELINE_ARTIFACTS_DIR, artifact.diskPath);
  try {
    if (existsSync(diskPath)) rmSync(diskPath, { recursive: true, force: true });
  } catch {
    // Best effort
  }
  await db.delete(pipelineArtifacts).where(eq(pipelineArtifacts.id, artifact.id));

  const { logAudit, getClientIp } = await import("./audit.js");
  const { getRequest } = await import("./request-context.js");
  const req = getRequest();
  logAudit({
    userId: currentUser.id,
    action: "pipeline.artifact_delete",
    targetType: "pipeline_artifact",
    targetId: artifact.id,
    metadata: { name: artifact.name, runId: artifact.runId },
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { deleted: true };
}

export async function getStepLogs(
  ownerName: string,
  repoName: string,
  runNumber: number,
  stepId: string,
) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return { error: "Run not found" };

  const [step] = await db.select().from(pipelineSteps).where(eq(pipelineSteps.id, stepId)).limit(1);
  if (!step || !step.logPath) return { error: "Logs not found" };

  const logPath = resolve(PIPELINE_LOGS_DIR, run.id, step.logPath);
  if (!existsSync(logPath)) return { error: "Log file not found", logs: "", lines: [] };

  // Return both raw text (for backwards compat / search-anywhere) and pre-
  // parsed lines (timestamp + ansi-rendered HTML) so the UI can render
  // colored logs without doing the conversion client-side.
  const content = readFileSync(logPath, "utf-8");
  const lines = parseLogBlob(content);

  // Resolve `file.ext:LINE` patterns to repo paths that actually exist at
  // the run's commit. We swallow any error here so log fetching is never
  // blocked by an annotation-resolution failure.
  let annotations: LogAnnotation[] = [];
  try {
    const repoDiskPath = resolveDiskPath(result.repo.diskPath);
    annotations = await resolveAnnotations(lines, repoDiskPath, run.commitOid);
  } catch {
    annotations = [];
  }

  return {
    logs: content,
    lines,
    annotations,
    commitSha: run.commitOid,
    status: step.status,
  };
}

export async function getPipelineConfig(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const diskPath = resolveDiskPath(result.repo.diskPath);
  let yamlContent: string;
  try {
    yamlContent = execFileSync(
      "git",
      ["show", `${result.repo.defaultBranch}:.groffee/pipelines.yml`],
      {
        cwd: diskPath,
        timeout: 10_000,
        encoding: "utf-8",
      },
    );
  } catch {
    return { yaml: null, config: null, hasConfig: false };
  }

  const { config, error } = parsePipelineYaml(yamlContent);
  return { yaml: yamlContent, config, error: error || null, hasConfig: true };
}

/**
 * Pure validation against the same Zod schema the runner uses. Used by the
 * config editor's "Validate" button so users see schema errors inline before
 * committing. Doesn't touch the repo on disk.
 */
export async function validatePipelineYaml(yaml: string) {
  const { config, error } = parsePipelineYaml(yaml);
  if (error) return { ok: false as const, error };
  return { ok: true as const, pipelines: Object.keys(config?.pipelines || {}) };
}

/**
 * Commit a new `.groffee/pipelines.yml` to the repo's default branch (or
 * open a PR, depending on editPolicy — `editFile` resolves it).
 *
 * Validates the YAML first; rejects on schema error. The "Edit config" UI
 * surfaces a useful success message based on the {commitOid, branchRef,
 * prNumber?} returned by editFile.
 */
export async function commitPipelineConfig(
  ownerName: string,
  repoName: string,
  yaml: string,
  message: string,
) {
  const currentUser = await getSessionUser();
  if (!currentUser) return { error: "Unauthorized" };

  // Validate before writing. The runner ALSO re-validates when triggering,
  // but blocking bad YAML at commit time is a much friendlier UX.
  const { config, error } = parsePipelineYaml(yaml);
  if (error || !config) {
    return { error: `Validation failed: ${error || "unknown"}` };
  }

  // Look up repo to grab the default branch — that's what we commit to.
  // editFile handles PR-mode itself based on repo.editPolicy.
  const result = await findRepo(ownerName, repoName, currentUser.id);
  if (!result) return { error: "Repository not found" };

  // Probe whether `.groffee/pipelines.yml` already exists on the default
  // branch — `editFile` requires the file to exist, `createFile` requires
  // it not to. We call the right one so first-time setup works without
  // forcing the user to drop a placeholder file first.
  const diskPath = resolveDiskPath(result.repo.diskPath);
  let fileExists = false;
  try {
    execFileSync("git", ["cat-file", "-e", `${result.repo.defaultBranch}:.groffee/pipelines.yml`], {
      cwd: diskPath,
      timeout: 5_000,
      stdio: "ignore",
    });
    fileExists = true;
  } catch {
    fileExists = false;
  }

  const { editFile, createFile } = await import("./repo-edit.js");
  const writer = fileExists ? editFile : createFile;
  const editResult = await writer({
    ownerName,
    repoName,
    ref: result.repo.defaultBranch,
    path: ".groffee/pipelines.yml",
    content: yaml,
    message: message?.trim() || "Update pipeline config",
  });
  if ("error" in editResult) return { error: editResult.error };
  return {
    ok: true as const,
    commitOid: editResult.commitOid,
    branchRef: editResult.branchRef,
    branchName: editResult.branchName,
    prNumber: editResult.prNumber,
  };
}

export async function dispatchPipeline(
  ownerName: string,
  repoName: string,
  ref: string,
  pipelineName?: string,
) {
  const currentUser = await getSessionUser();
  if (!currentUser) return { error: "Unauthorized" };

  const result = await findRepo(ownerName, repoName, currentUser.id);
  if (!result) return { error: "Repository not found" };
  if (currentUser.id !== result.owner.id) return { error: "Permission denied" };

  const diskPath = resolveDiskPath(result.repo.diskPath);
  let commitOid: string;
  try {
    commitOid = execFileSync("git", ["rev-parse", ref], {
      cwd: diskPath,
      timeout: 10_000,
      encoding: "utf-8",
    }).trim();
  } catch {
    return { error: `Could not resolve ref "${ref}"` };
  }

  const runIds = await triggerPipelines({
    repoId: result.repo.id,
    repoPath: diskPath,
    ref: `refs/heads/${ref}`,
    commitOid,
    trigger: "manual",
    triggeredById: currentUser.id,
    pipelineName,
  });

  if (runIds.length === 0) return { error: "No matching pipelines found" };
  return { runIds };
}

/**
 * Create a new pipeline run that re-executes only the previously-failed jobs.
 * Succeeded jobs are carved into the new run's DAG with status="success" and
 * their original timestamps copied forward, so the UI shows them as already
 * done. The runner skips any job that's already in a terminal state.
 *
 * Caveat: artifacts and on-disk logs from the original run are NOT copied to
 * the new run. Failed jobs run from scratch in a fresh workspace.
 */
export async function rerunFailedJobs(ownerName: string, repoName: string, runNumber: number) {
  const currentUser = await getSessionUser();
  if (!currentUser) return { error: "Unauthorized" };

  const result = await findRepo(ownerName, repoName, currentUser.id);
  if (!result) return { error: "Repository not found" };
  if (currentUser.id !== result.owner.id) return { error: "Permission denied" };

  const [originalRun] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!originalRun) return { error: "Run not found" };

  const failedStatuses = new Set(["failure", "timed_out", "cancelled"]);
  const originalJobs = await db
    .select()
    .from(pipelineJobs)
    .where(eq(pipelineJobs.runId, originalRun.id))
    .orderBy(pipelineJobs.sortOrder);

  if (!originalJobs.some((j) => failedStatuses.has(j.status))) {
    return { error: "No failed jobs to rerun" };
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
    return { error: "Cannot parse original run's config snapshot" };
  }

  const allRuns = await db
    .select({ number: pipelineRuns.number })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repoId, result.repo.id))
    .orderBy(desc(pipelineRuns.number))
    .limit(1);
  const nextNumber = (allRuns[0]?.number || 0) + 1;

  const newRunId = crypto.randomUUID();
  const now = new Date();

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
    triggeredById: currentUser.id,
    configSnapshot: JSON.stringify(taggedSnapshot),
    createdAt: now,
  });

  const jobOrder = resolveJobOrder(configSnapshot.jobs);
  for (let jobIdx = 0; jobIdx < jobOrder.length; jobIdx++) {
    const jobKey = jobOrder[jobIdx];
    const jobConfig = configSnapshot.jobs[jobKey];
    const baseName = jobConfig.name || jobKey;

    // Re-derive the cell list — same logic as pipeline-trigger so reruns
    // preserve the matrix shape from the original config snapshot.
    const cells: Array<{ values: MatrixValues | null; displayName: string }> = jobConfig.matrix
      ? expandMatrix(jobConfig.matrix).map((v) => ({
          values: v,
          displayName: `${baseName} (${matrixCellLabel(v)})`,
        }))
      : [{ values: null, displayName: baseName }];

    for (let cellIdx = 0; cellIdx < cells.length; cellIdx++) {
      const cell = cells[cellIdx];
      const original = originalJobs.find((j) => j.name === cell.displayName);
      const wasFailed = original ? failedStatuses.has(original.status) : true;
      const newJobId = crypto.randomUUID();

      await db.insert(pipelineJobs).values({
        id: newJobId,
        runId: newRunId,
        name: cell.displayName,
        status: wasFailed ? "queued" : "success",
        sortOrder: jobIdx * 1000 + cellIdx,
        matrixValues: cell.values ? JSON.stringify(cell.values) : null,
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
  }

  enqueueRun({ runId: newRunId, repoId: originalRun.repoId });

  return { runNumber: nextNumber, runId: newRunId };
}

export async function cancelPipelineRun(ownerName: string, repoName: string, runNumber: number) {
  const currentUser = await getSessionUser();
  if (!currentUser) return { error: "Unauthorized" };

  const result = await findRepo(ownerName, repoName, currentUser.id);
  if (!result) return { error: "Repository not found" };
  if (currentUser.id !== result.owner.id) return { error: "Permission denied" };

  const [run] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.number, runNumber)))
    .limit(1);
  if (!run) return { error: "Run not found" };

  cancelRunInQueue(run.id);
  return { cancelled: true };
}

export async function getLatestRunStatus(repoId: string) {
  const [latestRun] = await db
    .select({ status: pipelineRuns.status, number: pipelineRuns.number })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.repoId, repoId))
    .orderBy(desc(pipelineRuns.number))
    .limit(1);
  return latestRun || null;
}

/**
 * Recent pipeline runs on the SAME ref as a given run, excluding the current
 * one. Used by the run-detail sidebar to show "what else has happened on
 * this branch" — handy for spotting whether the failure is a flake or a
 * regression. Cursor-paginated like every other list endpoint here.
 *
 * Scoped by repoId for multi-tenancy. Visibility check goes through
 * `findRepo` so a private repo's history isn't leaked.
 */
export async function getRunHistoryForRef(
  ownerName: string,
  repoName: string,
  ref: string,
  excludeRunId: string,
  options: { cursor?: string | null; limit?: number } = {},
) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" as string };

  const limit = clampLimit(options.limit ?? 15);
  const rows = await db
    .select({
      id: pipelineRuns.id,
      number: pipelineRuns.number,
      status: pipelineRuns.status,
      commitOid: pipelineRuns.commitOid,
      pipelineName: pipelineRuns.pipelineName,
      triggeredById: pipelineRuns.triggeredById,
      createdAt: pipelineRuns.createdAt,
    })
    .from(pipelineRuns)
    .where(
      and(
        eq(pipelineRuns.repoId, result.repo.id),
        eq(pipelineRuns.ref, ref),
        cursorWhere(options.cursor, pipelineRuns.createdAt, pipelineRuns.id, "desc"),
      ),
    )
    .orderBy(...cursorOrderBy(pipelineRuns.createdAt, pipelineRuns.id, "desc"))
    .limit(limit + 1);

  // Drop the excluded run BEFORE pagination accounting so the displayed
  // count doesn't shift when the current page happens to contain it.
  const filtered = rows.filter((r) => r.id !== excludeRunId);

  const userIds = [...new Set(filtered.map((r) => r.triggeredById))];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.username]));

  const enriched = filtered.map((r) => ({
    ...r,
    triggeredBy: userMap.get(r.triggeredById) || "unknown",
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }));

  const page = paginatedResult(enriched, limit, "createdAt");
  return { runs: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

/**
 * Returns the most recent pipeline run for a given commit OID in a repo,
 * or null if no run exists. Scoped by repoId for multi-tenancy.
 */
export async function getLatestRunForCommit(repoId: string, commitOid: string) {
  if (!commitOid) return null;
  const [latestRun] = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      number: pipelineRuns.number,
      pipelineName: pipelineRuns.pipelineName,
      createdAt: pipelineRuns.createdAt,
    })
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.repoId, repoId), eq(pipelineRuns.commitOid, commitOid)))
    .orderBy(desc(pipelineRuns.number))
    .limit(1);
  if (!latestRun) return null;
  return {
    ...latestRun,
    createdAt:
      latestRun.createdAt instanceof Date ? latestRun.createdAt.toISOString() : latestRun.createdAt,
  };
}
