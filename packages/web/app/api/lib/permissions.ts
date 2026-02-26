import { db, repositories, repoCollaborators } from "@groffee/db";
import { eq, and } from "drizzle-orm";

/**
 * Check if a user can push to a repository.
 * Returns true if the user is the repo owner or a collaborator with write/admin permission.
 */
export async function canPush(userId: string, repoId: string): Promise<boolean> {
  const [repo] = await db
    .select({ ownerId: repositories.ownerId })
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);

  if (!repo) return false;
  if (repo.ownerId === userId) return true;

  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repoId), eq(repoCollaborators.userId, userId)))
    .limit(1);

  return collab != null && (collab.permission === "write" || collab.permission === "admin");
}

/**
 * Check if a user can read a repository.
 * Public repos are readable by anyone. Private repos require owner or collaborator status.
 */
export async function canRead(userId: string | null, repoId: string): Promise<boolean> {
  const [repo] = await db
    .select({ ownerId: repositories.ownerId, isPublic: repositories.isPublic })
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);

  if (!repo) return false;
  if (repo.isPublic) return true;
  if (!userId) return false;
  if (repo.ownerId === userId) return true;

  const [collab] = await db
    .select()
    .from(repoCollaborators)
    .where(and(eq(repoCollaborators.repoId, repoId), eq(repoCollaborators.userId, userId)))
    .limit(1);

  return collab != null;
}
