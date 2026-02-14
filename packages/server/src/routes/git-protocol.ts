import { Hono } from "hono";
import { db, repositories, users } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { handleInfoRefs, handleServiceRpc, snapshotRefs } from "@groffee/git";
import { verifyPassword } from "../lib/password.js";
import { canPush, canRead } from "../lib/permissions.js";
import { triggerIncrementalIndex } from "../lib/indexer.js";

type ServiceType = "git-upload-pack" | "git-receive-pack";

export const gitProtocolRoutes = new Hono();

function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;
    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}

async function authenticateGitUser(authHeader: string | null) {
  const creds = parseBasicAuth(authHeader);
  if (!creds) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, creds.username))
    .limit(1);

  if (!user) return null;

  const valid = await verifyPassword(user.passwordHash, creds.password);
  return valid ? user : null;
}

function authChallenge() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Groffee"' },
  });
}

async function resolveRepo(owner: string, repoName: string) {
  const name = repoName.replace(/\.git$/, "");

  const [user] = await db.select().from(users).where(eq(users.username, owner)).limit(1);
  if (!user) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.ownerId, user.id), eq(repositories.name, name)))
    .limit(1);

  return repo ?? null;
}

// GET /:owner/:repo.git/info/refs?service=git-upload-pack|git-receive-pack
gitProtocolRoutes.get("/:owner/:repo/info/refs", async (c) => {
  const service = c.req.query("service") as ServiceType | undefined;
  if (!service || !["git-upload-pack", "git-receive-pack"].includes(service)) {
    return c.text("Invalid service", 400);
  }

  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  if (service === "git-receive-pack") {
    const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
    if (!user) return authChallenge();

    const allowed = await canPush(user.id, repo.id);
    if (!allowed) return c.text("Permission denied", 403);
  } else if (!repo.isPublic) {
    const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
    if (!user) return authChallenge();

    const allowed = await canRead(user.id, repo.id);
    if (!allowed) return c.text("Repository not found", 404);
  }

  const serviceType = service.replace("git-", "") as "upload-pack" | "receive-pack";
  return handleInfoRefs(repo.diskPath, serviceType);
});

// POST /:owner/:repo.git/git-upload-pack
gitProtocolRoutes.post("/:owner/:repo/git-upload-pack", async (c) => {
  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  if (!repo.isPublic) {
    const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
    if (!user) return authChallenge();

    const allowed = await canRead(user.id, repo.id);
    if (!allowed) return c.text("Repository not found", 404);
  }

  return handleServiceRpc(repo.diskPath, "upload-pack", c.req.raw.body!);
});

// POST /:owner/:repo.git/git-receive-pack
gitProtocolRoutes.post("/:owner/:repo/git-receive-pack", async (c) => {
  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
  if (!user) return authChallenge();

  const allowed = await canPush(user.id, repo.id);
  if (!allowed) return c.text("Permission denied", 403);

  // Snapshot refs before push to detect changes afterwards
  const refsBefore = await snapshotRefs(repo.diskPath);

  return handleServiceRpc(repo.diskPath, "receive-pack", c.req.raw.body!, (exitCode) => {
    if (exitCode === 0) {
      triggerIncrementalIndex(repo.id, repo.diskPath, refsBefore).catch((err) =>
        console.error("Post-push indexing failed:", err),
      );
    }
  });
});
