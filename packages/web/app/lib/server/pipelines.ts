"use server";

import {
  db,
  pipelineRuns,
  pipelineJobs,
  pipelineSteps,
  pipelineArtifacts,
  repositories,
  users,
} from "@groffee/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getSessionUser } from "./session.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { resolveDiskPath, PIPELINE_LOGS_DIR } from "../../api/lib/paths.js";
import { parsePipelineYaml } from "../../api/lib/pipeline-config.js";
import { triggerPipelines } from "../../api/lib/pipeline-trigger.js";
import { cancelRun as cancelRunInQueue } from "../../api/lib/pipeline-queue.js";

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

export async function getPipelineRuns(ownerName: string, repoName: string, status?: string) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(
      status
        ? and(eq(pipelineRuns.repoId, result.repo.id), eq(pipelineRuns.status, status as any))
        : eq(pipelineRuns.repoId, result.repo.id),
    )
    .orderBy(desc(pipelineRuns.number))
    .limit(20);

  const userIds = [...new Set(runs.map((r) => r.triggeredById))];
  const triggeredByUsers =
    userIds.length > 0 ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const userMap = new Map(triggeredByUsers.map((u) => [u.id, u.username]));

  return {
    runs: runs.map((r) => ({
      ...r,
      triggeredBy: userMap.get(r.triggeredById) || "unknown",
      startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
      finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  };
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
  // can render a DAG. Map jobConfig key/name → needs[] of jobConfig keys.
  let jobNeedsByName: Map<string, string[]> = new Map();
  let jobImageByName: Map<string, string | undefined> = new Map();
  try {
    const config = JSON.parse(run.configSnapshot) as {
      jobs?: Record<string, { name?: string; needs?: string[]; image?: string }>;
    };
    if (config.jobs) {
      // Build lookup: configKey → resolved display name (jobConfig.name || configKey)
      const keyToDisplayName = new Map<string, string>();
      for (const [key, jc] of Object.entries(config.jobs)) {
        keyToDisplayName.set(key, jc.name || key);
      }
      for (const [key, jc] of Object.entries(config.jobs)) {
        const displayName = keyToDisplayName.get(key)!;
        const resolvedNeeds = (jc.needs || []).map((dep) => keyToDisplayName.get(dep) || dep);
        jobNeedsByName.set(displayName, resolvedNeeds);
        jobImageByName.set(displayName, jc.image);
      }
    }
  } catch {
    // Bad config snapshot; fall back to no DAG info
  }

  return {
    run: {
      ...run,
      triggeredBy: triggeredByUser?.username || "unknown",
      startedAt: serializeDate(run.startedAt),
      finishedAt: serializeDate(run.finishedAt),
      createdAt: serializeDate(run.createdAt),
    },
    jobs: jobs.map((job) => ({
      ...job,
      needs: jobNeedsByName.get(job.name) || [],
      image: jobImageByName.get(job.name),
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
    })),
    artifacts: artifacts.map((a) => ({
      ...a,
      createdAt: serializeDate(a.createdAt),
    })),
    isOwner: currentUser?.id === result.owner.id,
  };
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
  if (!existsSync(logPath)) return { error: "Log file not found", logs: "" };

  const content = readFileSync(logPath, "utf-8");
  return { logs: content, status: step.status };
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
