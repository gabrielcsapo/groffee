import { Hono } from "hono";
import { db, repositories, users, pagesDeployments } from "@groffee/db";
import { eq, and, desc } from "drizzle-orm";
import { optionalAuth } from "../middleware/auth.js";
import { PAGES_HOSTNAME, EXTERNAL_URL } from "../lib/paths.js";

export const pagesRoutes = new Hono();

async function findRepoForPages(ownerName: string, repoName: string, currentUserId?: string) {
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

// --- Get pages status ---
pagesRoutes.get("/:owner/:repo/pages", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPages(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const [activeDeployment] = await db
    .select()
    .from(pagesDeployments)
    .where(and(eq(pagesDeployments.repoId, result.repo.id), eq(pagesDeployments.status, "active")))
    .limit(1);

  if (!activeDeployment) {
    return c.json({ deployed: false, url: null, deployment: null });
  }

  // Get deployer info
  const [deployer] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, activeDeployment.deployedById))
    .limit(1);

  const port = new URL(EXTERNAL_URL).port;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const pagesUrl = `http://${PAGES_HOSTNAME}${portSuffix}/${result.owner.username}/${result.repo.name}/`;

  return c.json({
    deployed: true,
    url: pagesUrl,
    deployment: {
      ...activeDeployment,
      deployedBy: deployer?.username || "unknown",
      createdAt:
        activeDeployment.createdAt instanceof Date
          ? activeDeployment.createdAt.toISOString()
          : activeDeployment.createdAt,
    },
  });
});

// --- List deployment history ---
pagesRoutes.get("/:owner/:repo/pages/deployments", optionalAuth, async (c) => {
  const currentUser = c.get("user") as { id: string } | undefined;
  const result = await findRepoForPages(c.req.param("owner"), c.req.param("repo"), currentUser?.id);
  if (!result) return c.json({ error: "Repository not found" }, 404);

  const deployments = await db
    .select()
    .from(pagesDeployments)
    .where(eq(pagesDeployments.repoId, result.repo.id))
    .orderBy(desc(pagesDeployments.createdAt))
    .limit(20);

  // Batch load deployers
  const deployerIds = [...new Set(deployments.map((d) => d.deployedById))];
  const deployerUsers =
    deployerIds.length > 0 ? await db.select().from(users).where(eq(users.id, deployerIds[0])) : [];
  const userMap = new Map(deployerUsers.map((u) => [u.id, u.username]));

  return c.json({
    deployments: deployments.map((d) => ({
      ...d,
      deployedBy: userMap.get(d.deployedById) || "unknown",
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    })),
  });
});
