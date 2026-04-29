"use server";

import { db, pagesDeployments, repositories, users } from "@groffee/db";
import { eq, and, desc } from "drizzle-orm";
import { getSessionUser } from "./session.js";
import { PAGES_HOSTNAME, EXTERNAL_URL } from "../../api/lib/paths.js";

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

export async function getPagesStatus(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const [activeDeployment] = await db
    .select()
    .from(pagesDeployments)
    .where(and(eq(pagesDeployments.repoId, result.repo.id), eq(pagesDeployments.status, "active")))
    .limit(1);

  if (!activeDeployment) {
    return { deployed: false, url: null, deployment: null };
  }

  const [deployer] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, activeDeployment.deployedById))
    .limit(1);

  const port = new URL(EXTERNAL_URL).port;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const pagesUrl = `http://${PAGES_HOSTNAME}${portSuffix}/${result.owner.username}/${result.repo.name}/`;

  return {
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
  };
}

export async function getPagesDeployments(ownerName: string, repoName: string) {
  const currentUser = await getSessionUser();
  const result = await findRepo(ownerName, repoName, currentUser?.id);
  if (!result) return { error: "Repository not found" };

  const deployments = await db
    .select()
    .from(pagesDeployments)
    .where(eq(pagesDeployments.repoId, result.repo.id))
    .orderBy(desc(pagesDeployments.createdAt))
    .limit(20);

  const deployerIds = [...new Set(deployments.map((d) => d.deployedById))];
  const deployerUsers =
    deployerIds.length > 0 ? await db.select().from(users).where(eq(users.id, deployerIds[0])) : [];
  const userMap = new Map(deployerUsers.map((u) => [u.id, u.username]));

  return {
    deployments: deployments.map((d) => ({
      ...d,
      deployedBy: userMap.get(d.deployedById) || "unknown",
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    })),
  };
}
