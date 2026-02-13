import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { issueRoutes } from "./routes/issues.js";
import { pullRoutes } from "./routes/pulls.js";
import { gitProtocolRoutes } from "./routes/git-protocol.js";
import { sshKeyRoutes } from "./routes/ssh-keys.js";
import { collaboratorRoutes } from "./routes/collaborators.js";

export const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// REST API routes
app.route("/api/auth", authRoutes);
app.route("/api/repos", repoRoutes);
app.route("/api/repos", issueRoutes);
app.route("/api/repos", pullRoutes);
app.route("/api/user/ssh-keys", sshKeyRoutes);
app.route("/api/repos", collaboratorRoutes);

// Smart HTTP Git Protocol routes
// Git clients expect URLs like: /:owner/:repo.git/info/refs
app.route("/", gitProtocolRoutes);
