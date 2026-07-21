import { db, repositories, repositoryRedirects, users } from "@groffee/db";
import { and, eq } from "drizzle-orm";

export async function resolveRepositoryRedirect(ownerName: string, oldName: string) {
  const [row] = await db
    .select({ newName: repositories.name })
    .from(repositoryRedirects)
    .innerJoin(users, eq(users.id, repositoryRedirects.ownerId))
    .innerJoin(repositories, eq(repositories.id, repositoryRedirects.repoId))
    .where(and(eq(users.username, ownerName), eq(repositoryRedirects.oldName, oldName)))
    .limit(1);
  return row?.newName ?? null;
}
