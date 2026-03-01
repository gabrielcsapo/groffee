import { createHash } from "node:crypto";
import { db, repositories, users, personalAccessTokens } from "@groffee/db";
import { eq, and, or, gt, isNull } from "drizzle-orm";
import { verifyPassword } from "./password.js";

export function parseBasicAuth(
  header: string | null,
): { username: string; password: string } | null {
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

export async function authenticateGitUser(authHeader: string | null) {
  const creds = parseBasicAuth(authHeader);
  if (!creds) return null;

  // If password is a PAT, authenticate via token hash
  if (creds.password.startsWith("groffee_")) {
    const tokenHash = createHash("sha256").update(creds.password).digest("hex");
    const [pat] = await db
      .select()
      .from(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.tokenHash, tokenHash),
          or(
            isNull(personalAccessTokens.expiresAt),
            gt(personalAccessTokens.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);

    if (!pat) return null;

    const [user] = await db.select().from(users).where(eq(users.id, pat.userId)).limit(1);
    if (!user) return null;

    // Verify username matches token owner
    if (user.username !== creds.username) return null;

    // Update lastUsedAt (fire-and-forget)
    db.update(personalAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(personalAccessTokens.id, pat.id))
      .catch(() => {});

    return user;
  }

  // Otherwise authenticate with password
  const [user] = await db.select().from(users).where(eq(users.username, creds.username)).limit(1);

  if (!user) return null;

  const valid = await verifyPassword(user.passwordHash, creds.password);
  return valid ? user : null;
}

export function authChallenge() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Groffee"' },
  });
}

export async function resolveRepo(owner: string, repoName: string) {
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
