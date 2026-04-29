import { spawn, execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  statSync,
  rmSync,
  symlinkSync,
  renameSync,
  cpSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import {
  db,
  pipelineRuns,
  pipelineJobs,
  pipelineSteps,
  pipelineArtifacts,
  pagesDeployments,
  repositories,
  users,
} from "@groffee/db";
import { eq, and } from "drizzle-orm";
import {
  PIPELINE_WORKSPACES_DIR,
  PIPELINE_LOGS_DIR,
  PIPELINE_ARTIFACTS_DIR,
  PAGES_DIR,
  PAGES_MAX_DEPLOYMENTS,
  DATA_DIR,
} from "./paths.js";
import type { JobConfig, PipelineConfig } from "./pipeline-config.js";
import { resolveJobOrder } from "./pipeline-config.js";
import { resolveDiskPath } from "./paths.js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

// Detect Docker availability once at startup
let _dockerAvailable: boolean | null = null;
function isDockerAvailable(): boolean {
  if (_dockerAvailable === null) {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 5_000 });
      _dockerAvailable = true;
    } catch {
      _dockerAvailable = false;
    }
  }
  return _dockerAvailable;
}

/**
 * When groffee runs inside a Docker container with the host socket mounted,
 * `docker run -v <path>:/...` requires HOST paths, not container paths.
 *
 * Detection order:
 *   1. DOCKER_HOST_DATA_DIR env var (manual override; sanitized).
 *   2. Auto-detect by `docker inspect`-ing our own container and finding the
 *      host path that's bind-mounted at DATA_DIR.
 *   3. Fall back to DATA_DIR (correct when groffee runs on bare metal).
 */
let _hostDataDir: string | null = null;
function getHostDataDir(): string {
  if (_hostDataDir !== null) return _hostDataDir;

  // 1. Manual override — sanitize aggressively since this is a common source of error
  const envOverride = process.env.DOCKER_HOST_DATA_DIR?.trim().replace(/^=+/, "");
  if (envOverride) {
    if (envOverride.startsWith("/")) {
      _hostDataDir = envOverride;
      console.log(`[groffee] Using DOCKER_HOST_DATA_DIR=${envOverride} for pipeline volume mounts`);
      return _hostDataDir;
    } else {
      console.warn(
        `[groffee] DOCKER_HOST_DATA_DIR="${process.env.DOCKER_HOST_DATA_DIR}" is not an absolute path; ignoring.`,
      );
    }
  }

  // 2. Auto-detect via docker inspect of self
  try {
    const containerId = readSelfContainerId();
    if (containerId && isDockerAvailable()) {
      const raw = execSync(`docker inspect ${containerId}`, {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      }).toString();
      const info = JSON.parse(raw)[0];
      const mounts: Array<{ Source: string; Destination: string }> = info?.Mounts || [];
      // Find the mount whose Destination contains or equals DATA_DIR
      const match = mounts.find(
        (m) => DATA_DIR === m.Destination || DATA_DIR.startsWith(m.Destination + "/"),
      );
      if (match) {
        // Translate: host source path + (DATA_DIR relative to mount destination)
        const suffix = DATA_DIR.slice(match.Destination.length); // "" or "/sub"
        _hostDataDir = match.Source + suffix;
        console.log(`[groffee] Auto-detected host data dir: ${_hostDataDir}`);
        return _hostDataDir;
      }
    }
  } catch {
    // Auto-detection failed; fall through
  }

  // 3. Fall back — correct on bare metal, but will produce broken mounts in Docker
  _hostDataDir = DATA_DIR;
  return _hostDataDir;
}

function readSelfContainerId(): string | null {
  // Docker sets HOSTNAME to the short container ID by default
  if (process.env.HOSTNAME && /^[0-9a-f]{12}$/.test(process.env.HOSTNAME)) {
    return process.env.HOSTNAME;
  }
  // Fallback: parse /proc/self/cgroup or /proc/1/cpuset
  try {
    const cgroup = readFileSync("/proc/self/cgroup", "utf-8");
    const match = cgroup.match(/[0-9a-f]{64}/);
    if (match) return match[0];
  } catch {
    /* not on Linux or no /proc */
  }
  return null;
}

export async function executeRun(runId: string, signal: AbortSignal): Promise<void> {
  const now = new Date();

  // Load run info
  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} not found`);

  // Load repo info
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, run.repoId))
    .limit(1);
  if (!repo) throw new Error(`Repository ${run.repoId} not found`);

  // Get repo owner for pages
  const [owner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, repo.ownerId))
    .limit(1);

  const config: PipelineConfig = JSON.parse(run.configSnapshot);
  const workspaceDir = resolve(PIPELINE_WORKSPACES_DIR, runId);
  const logsDir = resolve(PIPELINE_LOGS_DIR, runId);

  try {
    // Mark run as running
    await db
      .update(pipelineRuns)
      .set({ status: "running", startedAt: now })
      .where(eq(pipelineRuns.id, runId));

    // Setup workspace: clone bare repo and checkout commit
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });

    const bareRepoPath = resolveDiskPath(repo.diskPath);
    execFileSync("git", ["clone", "--no-checkout", bareRepoPath, workspaceDir], {
      timeout: 60_000,
    });
    execFileSync("git", ["checkout", run.commitOid], {
      cwd: workspaceDir,
      timeout: 60_000,
    });

    // Load jobs and resolve execution order
    const jobs = await db
      .select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, runId))
      .orderBy(pipelineJobs.sortOrder);

    const jobOrder = resolveJobOrder(config.jobs);
    let runFailed = false;

    for (const jobKey of jobOrder) {
      if (signal.aborted) {
        await markRunCancelled(runId);
        return;
      }

      const jobConfig = config.jobs[jobKey];
      const jobRecord = jobs.find((j) => j.name === (jobConfig.name || jobKey));
      if (!jobRecord) continue;

      // Check if dependencies succeeded
      if (jobConfig.needs) {
        const depJobs = jobs.filter((j) =>
          jobConfig.needs!.some((n) => j.name === (config.jobs[n]?.name || n)),
        );
        const allSucceeded = depJobs.every((j) => j.status === "success");
        if (!allSucceeded) {
          await db
            .update(pipelineJobs)
            .set({ status: "skipped", finishedAt: new Date() })
            .where(eq(pipelineJobs.id, jobRecord.id));
          continue;
        }
      }

      // Execute job
      const jobSuccess = await executeJob(
        jobRecord.id,
        jobKey,
        jobConfig,
        (config.env || {}) as Record<string, string>,
        workspaceDir,
        logsDir,
        runId,
        signal,
        owner?.username || "unknown",
        repo.name,
        run.commitOid,
      );

      // Reload job status
      const [updatedJob] = await db
        .select()
        .from(pipelineJobs)
        .where(eq(pipelineJobs.id, jobRecord.id))
        .limit(1);
      if (updatedJob) {
        const idx = jobs.findIndex((j) => j.id === jobRecord.id);
        if (idx >= 0) jobs[idx] = updatedJob;
      }

      if (!jobSuccess) {
        runFailed = true;
        // Skip remaining jobs that depend on this one (they'll be skipped in the loop)
      }
    }

    // Mark run complete
    const finalStatus = signal.aborted ? "cancelled" : runFailed ? "failure" : "success";
    await db
      .update(pipelineRuns)
      .set({ status: finalStatus, finishedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
  } catch (err) {
    await db
      .update(pipelineRuns)
      .set({ status: "failure", finishedAt: new Date() })
      .where(eq(pipelineRuns.id, runId));
    throw err;
  } finally {
    // Cleanup workspace
    try {
      if (existsSync(workspaceDir)) {
        rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // Best effort cleanup
    }
  }
}

async function executeJob(
  jobId: string,
  jobKey: string,
  jobConfig: JobConfig,
  pipelineEnv: Record<string, string>,
  workspaceDir: string,
  logsDir: string,
  runId: string,
  signal: AbortSignal,
  ownerUsername: string,
  repoName: string,
  commitOid: string,
): Promise<boolean> {
  const jobLogsDir = resolve(logsDir, jobId);
  mkdirSync(jobLogsDir, { recursive: true });

  await db
    .update(pipelineJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(pipelineJobs.id, jobId));

  // Load steps
  const steps = await db
    .select()
    .from(pipelineSteps)
    .where(eq(pipelineSteps.jobId, jobId))
    .orderBy(pipelineSteps.sortOrder);

  let jobSuccess = true;

  // If job has an image and Docker is available, start ONE long-lived container
  // for the whole job so state (installed binaries, env modifications) persists
  // across steps. Each step then runs via `docker exec` in this container.
  let jobContainerName: string | undefined;
  const jobUsesDocker = jobConfig.image && isDockerAvailable();
  if (jobUsesDocker) {
    jobContainerName = `groffee-job-${jobId.replace(/-/g, "").slice(0, 24)}`;
    const startResult = await startJobContainer(
      jobContainerName,
      jobConfig.image!,
      workspaceDir,
      { ...pipelineEnv, ...((jobConfig.env || {}) as Record<string, string>) },
      runId,
      commitOid,
      ownerUsername,
      repoName,
      resolve(jobLogsDir, "_container.log"),
    );
    if (!startResult.success) {
      // Failed to start the container — mark all steps as failed and bail
      const stepLogPath = resolve(jobLogsDir, "_container.log");
      for (const step of steps) {
        appendLog(
          resolve(PIPELINE_LOGS_DIR, runId, join(jobId, `${step.id}.log`)),
          `Failed to start job container: ${startResult.error || "unknown error"}\n`,
        );
        await db
          .update(pipelineSteps)
          .set({
            status: "failure",
            exitCode: 1,
            finishedAt: new Date(),
            logPath: stepLogPath,
          })
          .where(eq(pipelineSteps.id, step.id));
      }
      await db
        .update(pipelineJobs)
        .set({ status: "failure", finishedAt: new Date() })
        .where(eq(pipelineJobs.id, jobId));
      return false;
    }
  }

  try {
    for (const step of steps) {
      if (signal.aborted) {
        await db
          .update(pipelineSteps)
          .set({ status: "cancelled", finishedAt: new Date() })
          .where(eq(pipelineSteps.id, step.id));
        jobSuccess = false;
        break;
      }

      if (!jobSuccess) {
        // Skip remaining steps after a failure
        await db
          .update(pipelineSteps)
          .set({ status: "skipped", finishedAt: new Date() })
          .where(eq(pipelineSteps.id, step.id));
        continue;
      }

      const logPath = join(jobId, `${step.id}.log`);
      const logFullPath = resolve(PIPELINE_LOGS_DIR, runId, logPath);

      await db
        .update(pipelineSteps)
        .set({ status: "running", startedAt: new Date(), logPath })
        .where(eq(pipelineSteps.id, step.id));

      let stepSuccess: boolean;

      if (step.uses === "deploy-pages") {
        // Handle deploy-pages built-in action
        const withConfig = step.withConfig ? JSON.parse(step.withConfig) : {};
        stepSuccess = await executeDeployPages(
          workspaceDir,
          withConfig.directory || "dist",
          ownerUsername,
          repoName,
          commitOid,
          runId,
          logFullPath,
        );
      } else if (step.command) {
        // Regular shell command (optionally in Docker container)
        stepSuccess = await executeStep(
          step.command,
          workspaceDir,
          { ...pipelineEnv, ...((jobConfig.env || {}) as Record<string, string>) },
          logFullPath,
          jobConfig.timeout * 1000,
          signal,
          runId,
          commitOid,
          ownerUsername,
          repoName,
          jobContainerName,
        );
      } else {
        appendLog(logFullPath, `Error: Step "${step.name}" has no command or action\n`);
        stepSuccess = false;
      }

      const exitCode = stepSuccess ? 0 : 1;
      await db
        .update(pipelineSteps)
        .set({
          status: stepSuccess ? "success" : "failure",
          exitCode,
          finishedAt: new Date(),
        })
        .where(eq(pipelineSteps.id, step.id));

      if (!stepSuccess) jobSuccess = false;
    }

    // Collect artifacts if job succeeded
    if (jobSuccess && jobConfig.artifacts?.upload) {
      await collectArtifacts(runId, jobId, jobKey, jobConfig.artifacts.upload, workspaceDir);
    }
  } finally {
    // Always tear down the job container, even on errors/cancellation
    if (jobContainerName) {
      try {
        execFileSync("docker", ["rm", "-f", jobContainerName], {
          stdio: "ignore",
          timeout: 30_000,
        });
      } catch {
        // Best effort
      }
    }
  }

  await db
    .update(pipelineJobs)
    .set({
      status: jobSuccess ? "success" : signal.aborted ? "cancelled" : "failure",
      finishedAt: new Date(),
    })
    .where(eq(pipelineJobs.id, jobId));

  return jobSuccess;
}

/**
 * Start a long-lived container for the duration of a job. Steps run inside it
 * via `docker exec` so binaries/env state from earlier steps remain available.
 */
async function startJobContainer(
  containerName: string,
  image: string,
  workspaceDir: string,
  env: Record<string, string>,
  runId: string,
  commitOid: string,
  ownerUsername: string,
  repoName: string,
  setupLogPath: string,
): Promise<{ success: boolean; error?: string }> {
  const hostDataDir = getHostDataDir();
  const toHostPath = (containerPath: string) => containerPath.replace(DATA_DIR, hostDataDir);
  const hostWorkspace = toHostPath(workspaceDir);
  const hostPages = toHostPath(PAGES_DIR);

  if (!hostWorkspace.startsWith("/") || !hostPages.startsWith("/")) {
    return {
      success: false,
      error: `Cannot resolve host paths for volume mounts (got "${hostWorkspace}", "${hostPages}"). Set DOCKER_HOST_DATA_DIR to an absolute host path.`,
    };
  }

  const containerEnv: Record<string, string> = {
    HOME: "/workspace",
    CI: "true",
    GROFFEE: "true",
    GROFFEE_RUN_ID: runId,
    GROFFEE_COMMIT: commitOid,
    GROFFEE_REPO: `${ownerUsername}/${repoName}`,
    // Place package manager caches on the container's overlay filesystem
    // (NOT the bind-mounted /workspace). The bind mount can struggle with
    // pnpm's CAS extraction (symlinks in package fixtures, etc.).
    npm_config_store_dir: "/var/cache/pnpm-store",
    npm_config_cache: "/var/cache/npm",
    YARN_CACHE_FOLDER: "/var/cache/yarn",
    // Force copy mode: store is on overlay FS, node_modules is on the bind
    // mount, so cross-filesystem hardlinks would fail. Copy is slower but
    // works reliably across mount boundaries.
    npm_config_package_import_method: "copy",
    ...env,
  };

  const args = [
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-w",
    "/workspace",
    "-v",
    `${hostWorkspace}:/workspace`,
    "-v",
    `${hostPages}:/pages`,
  ];
  for (const [k, v] of Object.entries(containerEnv)) {
    args.push("-e", `${k}=${v}`);
  }
  // Use `tail -f /dev/null` to keep the container alive until we exec into it
  // and eventually `docker rm -f` it. Works in any image with a posix shell.
  args.push(image, "sh", "-c", "tail -f /dev/null");

  appendLog(setupLogPath, `$ docker run ${image} (long-lived job container)\n`);
  try {
    execFileSync("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000, // image pull may take a while
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(setupLogPath, `Failed: ${message}\n`);
    return { success: false, error: message };
  }
}

function executeStep(
  command: string,
  cwd: string,
  env: Record<string, string>,
  logPath: string,
  timeoutMs: number,
  signal: AbortSignal,
  runId: string,
  commitOid: string,
  ownerUsername: string,
  repoName: string,
  jobContainerName?: string,
): Promise<boolean> {
  return new Promise((resolvePromise) => {
    // Ensure log file exists
    writeFileSync(logPath, "", { flag: "a" });

    // Per-run package manager caches to prevent cross-run contamination
    // (especially important when running as local subprocesses without Docker).
    // pnpm picks a store on the same filesystem as the project, which can be
    // shared across runs and lead to ENOENT errors when concurrent runs evict
    // each other's blobs. A per-run store dir avoids this.
    const inContainer = !!jobContainerName;
    const homePath = inContainer ? "/workspace" : cwd;
    const restrictedEnv: Record<string, string> = {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      HOME: homePath,
      CI: "true",
      GROFFEE: "true",
      GROFFEE_RUN_ID: runId,
      GROFFEE_COMMIT: commitOid,
      GROFFEE_REPO: `${ownerUsername}/${repoName}`,
      ...env,
    };
    // For local subprocess mode only, isolate package manager caches per workspace.
    // In container mode, the store is configured on the long-lived container's
    // env at startJobContainer (on overlay FS, not the bind mount).
    if (!inContainer) {
      restrictedEnv.npm_config_store_dir = `${homePath}/.pnpm-store`;
      restrictedEnv.npm_config_cache = `${homePath}/.npm-cache`;
      restrictedEnv.YARN_CACHE_FOLDER = `${homePath}/.yarn-cache`;
    }

    let child: ReturnType<typeof spawn>;

    if (jobContainerName) {
      // Run inside the job's persistent container via `docker exec`.
      // State from previous steps (installed binaries, modified PATH, files
      // dropped in /usr/local/bin by corepack, etc.) is preserved.
      const args = ["exec", "-w", "/workspace"];
      for (const [k, v] of Object.entries(restrictedEnv)) {
        args.push("-e", `${k}=${v}`);
      }
      args.push(jobContainerName, "sh", "-c", command);

      appendLog(logPath, `$ ${command}\n`);
      child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
      });
    } else {
      // Run as local subprocess
      child = spawn("sh", ["-c", command], {
        cwd,
        env: restrictedEnv,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
      });
    }

    const onAbort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      appendFileSync(logPath, chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      appendFileSync(logPath, chunk);
    });

    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolvePromise(code === 0);
    });

    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      appendLog(logPath, `Process error: ${err.message}\n`);
      resolvePromise(false);
    });
  });
}

async function executeDeployPages(
  workspaceDir: string,
  directory: string,
  ownerUsername: string,
  repoName: string,
  commitOid: string,
  runId: string,
  logPath: string,
): Promise<boolean> {
  try {
    const sourceDir = resolve(workspaceDir, directory);
    if (!existsSync(sourceDir)) {
      appendLog(logPath, `Error: Directory "${directory}" not found in workspace\n`);
      return false;
    }

    const pagesRepoDir = resolve(PAGES_DIR, ownerUsername, repoName);
    const deploymentsDir = resolve(pagesRepoDir, "deployments");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const deployDir = resolve(deploymentsDir, `${timestamp}-${commitOid.slice(0, 7)}`);
    const liveLink = resolve(pagesRepoDir, "live");

    mkdirSync(deploymentsDir, { recursive: true });

    // Copy build output to deployment dir
    appendLog(logPath, `Deploying pages from "${directory}" to ${ownerUsername}/${repoName}...\n`);
    cpSync(sourceDir, deployDir, { recursive: true });
    appendLog(logPath, `Copied build output to deployment directory\n`);

    // Atomic symlink swap
    const tempLink = resolve(pagesRepoDir, `.live-${crypto.randomUUID()}`);
    symlinkSync(deployDir, tempLink);
    renameSync(tempLink, liveLink);
    appendLog(logPath, `Updated live symlink\n`);

    // Get repo for DB update
    const [repo] = await db
      .select()
      .from(repositories)
      .innerJoin(users, eq(users.id, repositories.ownerId))
      .where(and(eq(users.username, ownerUsername), eq(repositories.name, repoName)))
      .limit(1);

    if (repo) {
      // Mark previous deployments as superseded
      await db
        .update(pagesDeployments)
        .set({ status: "superseded" })
        .where(
          and(
            eq(pagesDeployments.repoId, repo.repositories.id),
            eq(pagesDeployments.status, "active"),
          ),
        );

      // Insert new deployment record
      await db.insert(pagesDeployments).values({
        id: crypto.randomUUID(),
        repoId: repo.repositories.id,
        runId,
        commitOid,
        diskPath: relative(PAGES_DIR, deployDir),
        status: "active",
        deployedById: repo.users.id,
        createdAt: new Date(),
      });
    }

    // Cleanup old deployments
    await cleanupOldDeployments(deploymentsDir);

    appendLog(logPath, `Pages deployed successfully!\n`);
    return true;
  } catch (err) {
    appendLog(logPath, `Deploy pages error: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

async function cleanupOldDeployments(deploymentsDir: string): Promise<void> {
  try {
    const entries = readdirSync(deploymentsDir)
      .map((name) => ({
        name,
        path: resolve(deploymentsDir, name),
        mtime: statSync(resolve(deploymentsDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (let i = PAGES_MAX_DEPLOYMENTS; i < entries.length; i++) {
      rmSync(entries[i].path, { recursive: true, force: true });
    }
  } catch {
    // Best effort
  }
}

async function collectArtifacts(
  runId: string,
  jobId: string,
  _jobKey: string,
  uploads: Array<{ name: string; path: string }>,
  workspaceDir: string,
): Promise<void> {
  for (const upload of uploads) {
    try {
      const sourcePath = resolve(workspaceDir, upload.path);
      if (!existsSync(sourcePath)) continue;

      const artifactDir = resolve(PIPELINE_ARTIFACTS_DIR, runId, upload.name);
      mkdirSync(artifactDir, { recursive: true });

      // Copy artifact files
      const stat = statSync(sourcePath);
      if (stat.isDirectory()) {
        cpSync(sourcePath, artifactDir, { recursive: true });
      } else {
        cpSync(sourcePath, resolve(artifactDir, upload.name));
      }

      // Calculate total size
      const totalSize = getDirSize(artifactDir);

      await db.insert(pipelineArtifacts).values({
        id: crypto.randomUUID(),
        runId,
        jobId,
        name: upload.name,
        diskPath: relative(PIPELINE_ARTIFACTS_DIR, artifactDir),
        sizeBytes: totalSize,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error(`Failed to collect artifact "${upload.name}":`, err);
    }
  }
}

function getDirSize(dirPath: string): number {
  let totalSize = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSize(fullPath);
      } else {
        totalSize += statSync(fullPath).size;
      }
    }
  } catch {
    // ignore
  }
  return totalSize;
}

function appendLog(logPath: string, message: string): void {
  try {
    mkdirSync(resolve(logPath, ".."), { recursive: true });
    appendFileSync(logPath, message);
  } catch {
    // Best effort
  }
}

async function markRunCancelled(runId: string): Promise<void> {
  const now = new Date();
  await db
    .update(pipelineRuns)
    .set({ status: "cancelled", finishedAt: now })
    .where(eq(pipelineRuns.id, runId));
}
