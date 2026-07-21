import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "@groffee/db";
import { sql } from "drizzle-orm";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { issueRoutes } from "./routes/issues.js";
import { pullRoutes } from "./routes/pulls.js";
import { gitProtocolRoutes } from "./routes/git-protocol.js";
import { gitLfsRoutes } from "./routes/git-lfs.js";
import { sshKeyRoutes } from "./routes/ssh-keys.js";
import { collaboratorRoutes } from "./routes/collaborators.js";
import { searchRoutes } from "./routes/search.js";
import { tokenRoutes } from "./routes/tokens.js";
import { pipelineRoutes } from "./routes/pipelines.js";
import { pagesRoutes } from "./routes/pages.js";
import { uploadRoutes } from "./routes/uploads.js";
import { secretRoutes } from "./routes/secrets.js";
import { inviteRoutes, inviteAcceptRoutes } from "./routes/invites.js";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/request-logger.js";
import { getQueueStatus, startStuckRunSweeper } from "./lib/pipeline-queue.js";
import { startArtifactRetentionSweeper } from "./lib/artifact-sweeper.js";
import { getPipelineRuntimeStatus } from "./lib/pipeline-runner.js";
import { verifySecretEncryption } from "./lib/secret-crypto.js";

const startTime = Date.now();

import {
  DATA_DIR,
  REPOS_DIR,
  PIPELINE_ARTIFACTS_DIR,
  PIPELINE_LOGS_DIR,
  PIPELINE_WORKSPACES_DIR,
  PAGES_DIR,
} from "./lib/paths.js";

for (const directory of [
  DATA_DIR,
  REPOS_DIR,
  PIPELINE_WORKSPACES_DIR,
  PIPELINE_LOGS_DIR,
  PIPELINE_ARTIFACTS_DIR,
  PAGES_DIR,
]) {
  mkdirSync(directory, { recursive: true });
}

// Background workers — started once per process. The stuck-run sweeper
// recovers runs whose worker process died (server restart, OOM) by marking
// them timed_out. The retention sweeper deletes artifact rows + on-disk
// dirs whose `retentionUntil` has passed.
startStuckRunSweeper();
startArtifactRetentionSweeper();

export const app = new Hono();

app.use("*", requestId);
app.use("*", requestLogger);
app.use("/api/*", cors());

// Health check
app.get("/api/health", async (c) => {
  let dbOk = false;
  try {
    db.all(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const runtimeDirs = [
    DATA_DIR,
    REPOS_DIR,
    PIPELINE_WORKSPACES_DIR,
    PIPELINE_LOGS_DIR,
    PIPELINE_ARTIFACTS_DIR,
    PAGES_DIR,
  ];
  const directories = runtimeDirs.map((path) => {
    try {
      accessSync(path, constants.R_OK | constants.W_OK);
      return { path, status: "writable" as const };
    } catch {
      return { path, status: existsSync(path) ? ("not_writable" as const) : ("missing" as const) };
    }
  });
  const pipeline = getPipelineRuntimeStatus();
  const secretEncryption = verifySecretEncryption();
  const uptimeMs = Date.now() - startTime;
  const memUsage = process.memoryUsage();
  const directoriesOk = directories.every((directory) => directory.status === "writable");
  const pipelineReady = pipeline.docker && pipeline.networkReady;
  const healthy =
    dbOk &&
    directoriesOk &&
    secretEncryption &&
    (process.env.NODE_ENV !== "production" || pipelineReady);

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      uptime: uptimeMs,
      database: dbOk ? "connected" : "error",
      directories,
      pipeline,
      secretEncryption: secretEncryption ? "ok" : "error",
      queue: getQueueStatus(),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
    },
    healthy ? 200 : 503,
  );
});

// REST API routes
app.route("/api/auth", authRoutes);
app.route("/api/repos", repoRoutes);
app.route("/api/repos", issueRoutes);
app.route("/api/repos", pullRoutes);
app.route("/api/user/ssh-keys", sshKeyRoutes);
app.route("/api/user/tokens", tokenRoutes);
app.route("/api/repos", collaboratorRoutes);
app.route("/api/repos", searchRoutes);
app.route("/api", searchRoutes);
app.route("/api/repos", pipelineRoutes);
app.route("/api/repos", secretRoutes);
app.route("/api/repos", pagesRoutes);
app.route("/api/repos", inviteRoutes);
app.route("/api", inviteAcceptRoutes);
app.route("/api/uploads", uploadRoutes);

// Git LFS routes (must be before git protocol routes)
app.route("/", gitLfsRoutes);

// Smart HTTP Git Protocol routes
// Git clients expect URLs like: /:owner/:repo.git/info/refs
app.route("/", gitProtocolRoutes);
