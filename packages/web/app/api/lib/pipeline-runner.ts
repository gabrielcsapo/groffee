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
  repoSecrets,
} from "@groffee/db";
import { eq, and, inArray } from "drizzle-orm";
import { decryptSecret } from "./secret-crypto.js";
import {
  PIPELINE_WORKSPACES_DIR,
  PIPELINE_LOGS_DIR,
  PIPELINE_ARTIFACTS_DIR,
  PAGES_DIR,
  PAGES_MAX_DEPLOYMENTS,
  DATA_DIR,
} from "./paths.js";
import type { JobConfig, PipelineConfig, MatrixValues } from "./pipeline-config.js";
import { resolveJobOrder, interpolateTemplate } from "./pipeline-config.js";
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

    // Group DB rows by jobKey. With matrix expansion, one jobKey may map to
    // multiple rows (one per cell). The base name (jobConfig.name || jobKey)
    // matches the `name` prefix on each cell row; matrix rows have
    // ` (k=v, ...)` appended.
    const rowsByJobKey = new Map<string, typeof jobs>();
    for (const jobKey of jobOrder) {
      const jc = config.jobs[jobKey];
      const baseName = jc.name || jobKey;
      const matched = jobs.filter((j) => j.name === baseName || j.name.startsWith(`${baseName} (`));
      rowsByJobKey.set(jobKey, matched);
    }

    for (const jobKey of jobOrder) {
      if (signal.aborted) {
        await markRunStopped(runId, abortStatus(signal));
        return;
      }

      const jobConfig = config.jobs[jobKey];
      const cellRows = rowsByJobKey.get(jobKey) || [];
      if (cellRows.length === 0) continue;

      // Check if dependencies succeeded — `needs: build` is satisfied only
      // when EVERY cell of `build` is in `success`. If any cell of a needed
      // job didn't succeed, all cells of this job are skipped.
      let depsOk = true;
      if (jobConfig.needs) {
        for (const depKey of jobConfig.needs) {
          const depRows = rowsByJobKey.get(depKey) || [];
          if (depRows.length === 0 || !depRows.every((j) => j.status === "success")) {
            depsOk = false;
            break;
          }
        }
      }

      for (const jobRecord of cellRows) {
        // Already terminal (e.g. partial-rerun carve-forward) — count toward
        // the run's overall failure flag but don't re-execute.
        if (
          jobRecord.status === "success" ||
          jobRecord.status === "skipped" ||
          jobRecord.status === "cancelled"
        ) {
          if (jobRecord.status !== "success") runFailed = true;
          continue;
        }

        if (!depsOk) {
          await db
            .update(pipelineJobs)
            .set({ status: "skipped", finishedAt: new Date() })
            .where(eq(pipelineJobs.id, jobRecord.id));
          // Reflect in our in-memory copy so downstream jobs see "skipped"
          // and treat this job as failed for needs resolution.
          jobRecord.status = "skipped";
          continue;
        }

        // Decode matrix values for this cell (null on non-matrix jobs).
        let matrixValues: MatrixValues | null = null;
        if (jobRecord.matrixValues) {
          try {
            matrixValues = JSON.parse(jobRecord.matrixValues) as MatrixValues;
          } catch {
            matrixValues = null;
          }
        }

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
          repo.id,
          matrixValues,
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
          // Keep grouped view in sync too.
          const groupIdx = cellRows.findIndex((j) => j.id === jobRecord.id);
          if (groupIdx >= 0) cellRows[groupIdx] = updatedJob;
        }

        if (!jobSuccess) {
          runFailed = true;
        }
      }
    }

    // Mark run complete
    const finalStatus = signal.aborted ? abortStatus(signal) : runFailed ? "failure" : "success";
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

/**
 * Load + decrypt all repo-scoped secrets, returning a name→plaintext map plus
 * the IDs we read so the caller can bump `lastUsedAt` in a single batch.
 *
 * Decryption errors do NOT propagate — a corrupted secret skips that single
 * entry rather than failing the whole job. We log a warning so it shows up in
 * server logs (NOT the job log; secret names are sensitive enough that we
 * don't want them in user-visible build output even on error).
 */
async function loadRepoSecrets(
  repoId: string,
): Promise<{ env: Record<string, string>; ids: string[] }> {
  const rows = await db
    .select({
      id: repoSecrets.id,
      name: repoSecrets.name,
      ciphertext: repoSecrets.ciphertext,
    })
    .from(repoSecrets)
    .where(eq(repoSecrets.repoId, repoId));

  const env: Record<string, string> = {};
  const ids: string[] = [];
  for (const row of rows) {
    try {
      // The DB column is `blob({mode:"buffer"})` so we get a Buffer back.
      env[row.name] = decryptSecret(row.ciphertext as Buffer);
      ids.push(row.id);
    } catch (err) {
      console.warn(
        `[pipelines] failed to decrypt secret ${row.name} for repo ${repoId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return { env, ids };
}

async function bumpSecretLastUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db
      .update(repoSecrets)
      .set({ lastUsedAt: new Date() })
      .where(inArray(repoSecrets.id, ids));
  } catch (err) {
    console.warn("[pipelines] failed to bump secret lastUsedAt:", err);
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
  repoId: string,
  matrixValues: MatrixValues | null,
): Promise<boolean> {
  // Resolve matrix template substitutions for the job's image (steps are
  // resolved per-step below since each step has its own `command`).
  const resolvedImage =
    matrixValues && jobConfig.image
      ? interpolateTemplate(jobConfig.image, { matrix: matrixValues })
      : jobConfig.image;
  const jobLogsDir = resolve(logsDir, jobId);
  mkdirSync(jobLogsDir, { recursive: true });

  await db
    .update(pipelineJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(pipelineJobs.id, jobId));

  // Load + decrypt repo secrets ONCE per job. We never log values, and the
  // `secretIds` list lets us bump lastUsedAt in a single update at the end.
  // SECURITY: The plaintext map lives only in this function's stack; it is
  // passed to docker exec/run via -e but never written to a step log file.
  const { env: secretEnv, ids: secretIds } = await loadRepoSecrets(repoId);

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
  const jobUsesDocker = resolvedImage && isDockerAvailable();
  if (jobUsesDocker) {
    jobContainerName = `groffee-job-${jobId.replace(/-/g, "").slice(0, 24)}`;
    const startResult = await startJobContainer(
      jobContainerName,
      resolvedImage!,
      workspaceDir,
      // Order matters: secrets first so a colliding pipeline.env / job.env
      // wins and we never accidentally leak a secret value into a non-secret
      // env var name. (Also: pipeline.env is committed in YAML, so a name
      // collision is the user's signal that the YAML overrides the secret.)
      {
        ...secretEnv,
        ...pipelineEnv,
        ...((jobConfig.env || {}) as Record<string, string>),
      },
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
        // Regular shell command (optionally in Docker container).
        // Apply matrix substitutions to the command text so e.g.
        // `npm run test --node=${{ matrix.node }}` resolves per-cell.
        const resolvedCommand = matrixValues
          ? interpolateTemplate(step.command, { matrix: matrixValues })
          : step.command;
        stepSuccess = await executeStep(
          resolvedCommand,
          workspaceDir,
          {
            ...secretEnv,
            ...pipelineEnv,
            ...((jobConfig.env || {}) as Record<string, string>),
          },
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

  // Single batched update so we don't fan out into N writes per job.
  await bumpSecretLastUsed(secretIds);

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
    // Node's execFileSync error message includes the full argv (which contains
    // -e KEY=VAL entries — i.e. plaintext secrets). Scrub it before writing
    // to the user-visible log AND before returning to the caller.
    const raw = err instanceof Error ? err.message : String(err);
    const scrubbed = scrubDockerArgsFromMessage(raw);
    appendLog(setupLogPath, `Failed: ${scrubbed}\n`);
    return { success: false, error: scrubbed };
  }
}

/**
 * Best-effort sanitizer for error messages produced by Node's `execFileSync`
 * when invoking docker. Removes any `-e NAME=VALUE` arg, replacing it with
 * `-e NAME=***`. Also removes anything after the start of `tail -f`/the image
 * argv tail, since the error formatter sometimes splices the full argv into
 * the message.
 *
 * This is defense-in-depth — the calling code already avoids logging the env
 * map directly, but Node sometimes leaks it via error.message.
 */
function scrubDockerArgsFromMessage(message: string): string {
  return message
    .replace(/(-e\s+)([A-Za-z_][A-Za-z0-9_]*)=([^\s'"\\]*)/g, "$1$2=***")
    .replace(/(--env\s+)([A-Za-z_][A-Za-z0-9_]*)=([^\s'"\\]*)/g, "$1$2=***");
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

    const writeLine = createLinePrefixer(logPath);
    child.stdout?.on("data", writeLine);
    child.stderr?.on("data", writeLine);

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
  uploads: Array<{ name: string; path: string; retention_days?: number }>,
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

      const createdAt = new Date();
      const retentionUntil =
        typeof upload.retention_days === "number" && upload.retention_days > 0
          ? new Date(createdAt.getTime() + upload.retention_days * 86_400_000)
          : null;

      await db.insert(pipelineArtifacts).values({
        id: crypto.randomUUID(),
        runId,
        jobId,
        name: upload.name,
        diskPath: relative(PIPELINE_ARTIFACTS_DIR, artifactDir),
        sizeBytes: totalSize,
        retentionUntil,
        createdAt,
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

/**
 * Append text to a log file with an ISO-8601 millisecond timestamp prefix on
 * each line. Format: `2026-05-05T19:34:21.123Z\tcontent\n`.
 *
 * The READ side splits on the first TAB, so the content can contain any
 * bytes (ANSI escapes, more tabs, etc.) without ambiguity.
 */
function appendLog(logPath: string, message: string): void {
  try {
    mkdirSync(resolve(logPath, ".."), { recursive: true });
    appendFileSync(logPath, prefixTimestamps(message));
  } catch {
    // Best effort
  }
}

/**
 * Per-stream line buffer for `executeStep`. The runner gets `data` chunks
 * that may split a line in the middle, so we hold the partial tail until a
 * `\n` arrives. Multiple chunks delivered in the same tick still get one
 * timestamp per line (at flush time), which is good enough for ms accuracy.
 */
function createLinePrefixer(logPath: string): (chunk: Buffer) => void {
  let pending = "";
  return (chunk: Buffer) => {
    pending += chunk.toString("utf-8");
    let nl: number;
    let out = "";
    while ((nl = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      out += `${new Date().toISOString()}\t${line}\n`;
    }
    if (out.length > 0) {
      try {
        appendFileSync(logPath, out);
      } catch {
        // Best effort
      }
    }
  };
}

function prefixTimestamps(message: string): string {
  if (!message) return "";
  // Split keeping behavior consistent with line-prefixer: complete lines end
  // in `\n` and get a prefix; a trailing partial line (no `\n`) also gets a
  // prefix and a synthetic newline so the on-disk format stays uniform.
  const ts = new Date().toISOString();
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < message.length; i++) {
    if (message.charCodeAt(i) === 10 /* \n */) {
      out.push(`${ts}\t${message.slice(start, i)}\n`);
      start = i + 1;
    }
  }
  if (start < message.length) {
    out.push(`${ts}\t${message.slice(start)}\n`);
  }
  return out.join("");
}

async function markRunStopped(runId: string, status: "cancelled" | "timed_out"): Promise<void> {
  const now = new Date();
  await db.update(pipelineRuns).set({ status, finishedAt: now }).where(eq(pipelineRuns.id, runId));
}

/**
 * Map an aborted signal back to a terminal run status.
 *
 * The queue aborts with `new Error("timeout")` when the run-level deadline
 * fires; user/concurrency cancels use the default reason. We branch on the
 * reason message rather than the reason identity since AbortController.abort()
 * wraps non-Error reasons.
 */
function abortStatus(signal: AbortSignal): "cancelled" | "timed_out" {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message === "timeout") return "timed_out";
  if (typeof reason === "string" && reason === "timeout") return "timed_out";
  return "cancelled";
}
