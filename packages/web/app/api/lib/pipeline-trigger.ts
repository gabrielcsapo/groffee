import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  db,
  pipelineRuns,
  pipelineJobs,
  pipelineSteps,
  pipelines,
  pullRequests,
} from "@groffee/db";
import { eq, and, max } from "drizzle-orm";
import {
  parsePipelineYaml,
  matchesTrigger,
  resolveJobOrder,
  interpolateTemplate,
} from "./pipeline-config.js";
import { enqueueRun } from "./pipeline-queue.js";
import { logAudit } from "./audit.js";
import { createHash } from "node:crypto";

export async function triggerPipelines(params: {
  repoId: string;
  repoPath: string;
  ref: string;
  commitOid: string;
  trigger: "push" | "pull_request" | "manual";
  triggeredById: string;
  pipelineName?: string; // for manual triggers, specific pipeline to run
}): Promise<string[]> {
  const { repoId, repoPath, ref, commitOid, trigger, triggeredById, pipelineName } = params;
  const runIds: string[] = [];

  // Read .groffee/pipelines.yml from the repo at the given commit
  let yamlContent: string;
  try {
    yamlContent = execFileSync("git", ["show", `${commitOid}:.groffee/pipelines.yml`], {
      cwd: repoPath,
      timeout: 10_000,
      encoding: "utf-8",
    });
  } catch {
    // No pipeline config file — not an error, just nothing to trigger
    return [];
  }

  // Parse and validate
  const { config, error } = parsePipelineYaml(yamlContent);
  if (!config || error) {
    console.error(`Pipeline config error in repo ${repoId}: ${error}`);
    return [];
  }

  // Extract branch name from ref (e.g., "refs/heads/main" → "main")
  const branchName = ref.replace(/^refs\/heads\//, "");

  // Cache the parsed config
  const configHash = createHash("sha256").update(yamlContent).digest("hex");
  try {
    await db
      .insert(pipelines)
      .values({
        id: crypto.randomUUID(),
        repoId,
        ref: branchName,
        configYaml: yamlContent,
        configHash,
        parsedConfig: JSON.stringify(config),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pipelines.repoId, pipelines.ref],
        set: {
          configYaml: yamlContent,
          configHash,
          parsedConfig: JSON.stringify(config),
          updatedAt: new Date(),
        },
      });
  } catch {
    // Non-fatal: caching failure doesn't block execution
  }

  // Filter pipelines matching the trigger
  for (const [name, pipelineConfig] of Object.entries(config.pipelines)) {
    if (pipelineName && name !== pipelineName) continue;
    if (!matchesTrigger(pipelineConfig, trigger, branchName)) continue;

    // Get next run number for this repo
    const [maxRun] = await db
      .select({ maxNum: max(pipelineRuns.number) })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.repoId, repoId))
      .limit(1);
    const nextNumber = (maxRun?.maxNum || 0) + 1;

    const runId = crypto.randomUUID();
    const now = new Date();

    // Create run record
    await db.insert(pipelineRuns).values({
      id: runId,
      repoId,
      pipelineName: name,
      number: nextNumber,
      status: "queued",
      trigger,
      ref: branchName,
      commitOid,
      triggeredById,
      configSnapshot: JSON.stringify(pipelineConfig),
      createdAt: now,
    });

    // Create job and step records
    const jobOrder = resolveJobOrder(pipelineConfig.jobs);
    for (let jobIdx = 0; jobIdx < jobOrder.length; jobIdx++) {
      const jobKey = jobOrder[jobIdx];
      const jobConfig = pipelineConfig.jobs[jobKey];
      const jobId = crypto.randomUUID();

      await db.insert(pipelineJobs).values({
        id: jobId,
        runId,
        name: jobConfig.name || jobKey,
        status: "queued",
        sortOrder: jobIdx,
        createdAt: now,
      });

      for (let stepIdx = 0; stepIdx < jobConfig.steps.length; stepIdx++) {
        const stepConfig = jobConfig.steps[stepIdx];
        await db.insert(pipelineSteps).values({
          id: crypto.randomUUID(),
          jobId,
          name: stepConfig.name,
          command: stepConfig.run || null,
          uses: stepConfig.uses || null,
          withConfig: stepConfig.with ? JSON.stringify(stepConfig.with) : null,
          status: "queued",
          sortOrder: stepIdx,
          createdAt: now,
        });
      }
    }

    // Compute concurrency group
    let concurrencyGroup: string | undefined;
    let cancelInProgress = false;
    if (pipelineConfig.concurrency) {
      concurrencyGroup = interpolateTemplate(pipelineConfig.concurrency.group, {
        ref: branchName,
        pipeline: name,
      });
      cancelInProgress = pipelineConfig.concurrency.cancel_in_progress;
    }

    // Enqueue for execution
    enqueueRun({
      runId,
      repoId,
      concurrencyGroup,
      cancelInProgress,
    });

    runIds.push(runId);

    // Audit log
    logAudit({
      userId: triggeredById,
      action: "pipeline.trigger",
      targetType: "pipeline_run",
      targetId: runId,
      metadata: { pipeline: name, trigger, ref: branchName, commitOid },
    }).catch(console.error);
  }

  return runIds;
}

/**
 * Called after a successful git push. Diffs ref snapshots and triggers pipelines.
 */
export async function triggerPipelinesFromPush(
  repoId: string,
  repoPath: string,
  userId: string,
  refsBefore: Map<string, string>,
): Promise<void> {
  // Get current refs
  let currentRefsOutput: string;
  try {
    currentRefsOutput = execFileSync(
      "git",
      ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"],
      { cwd: repoPath, timeout: 10_000, encoding: "utf-8" },
    );
  } catch {
    return;
  }

  const currentRefs = new Map<string, string>();
  for (const line of currentRefsOutput.trim().split("\n")) {
    const [refName, oid] = line.split(" ");
    if (refName && oid) currentRefs.set(refName, oid);
  }

  // Find changed refs
  for (const [refName, newOid] of currentRefs) {
    const oldOid = refsBefore.get(refName);
    if (oldOid === newOid) continue; // No change

    // Trigger push pipelines
    await triggerPipelines({
      repoId,
      repoPath,
      ref: refName,
      commitOid: newOid,
      trigger: "push",
      triggeredById: userId,
    });

    // Also check for open PRs with this branch as source
    const branchName = refName.replace(/^refs\/heads\//, "");
    const openPRs = await db
      .select({ id: pullRequests.id })
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.repoId, repoId),
          eq(pullRequests.sourceBranch, branchName),
          eq(pullRequests.status, "open"),
        ),
      );

    if (openPRs.length > 0) {
      await triggerPipelines({
        repoId,
        repoPath,
        ref: refName,
        commitOid: newOid,
        trigger: "pull_request",
        triggeredById: userId,
      });
    }
  }
}
