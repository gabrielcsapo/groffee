import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "@groffee/db";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { issueRoutes } from "./routes/issues.js";
import { pullRoutes } from "./routes/pulls.js";
import { gitProtocolRoutes } from "./routes/git-protocol.js";
import { sshKeyRoutes } from "./routes/ssh-keys.js";
import { collaboratorRoutes } from "./routes/collaborators.js";
import { searchRoutes } from "./routes/search.js";
import { tokenRoutes } from "./routes/tokens.js";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/request-logger.js";

const startTime = Date.now();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = process.env.DATA_DIR || path.resolve(PROJECT_ROOT, "..", "..", "data", "repositories");

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

  const dataExists = existsSync(DATA_DIR);
  const uptimeMs = Date.now() - startTime;
  const memUsage = process.memoryUsage();
  const healthy = dbOk && dataExists;

  return c.json({
    status: healthy ? "ok" : "degraded",
    uptime: uptimeMs,
    database: dbOk ? "connected" : "error",
    dataDirectory: dataExists ? "exists" : "missing",
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
  }, healthy ? 200 : 503);
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

// Smart HTTP Git Protocol routes
// Git clients expect URLs like: /:owner/:repo.git/info/refs
app.route("/", gitProtocolRoutes);
