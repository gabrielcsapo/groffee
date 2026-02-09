import { Hono } from "hono";
import { db, repositories, users } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { handleInfoRefs, handleServiceRpc } from "@groffee/git";
import type { HttpBindings } from "@hono/node-server";

type ServiceType = "git-upload-pack" | "git-receive-pack";

export const gitProtocolRoutes = new Hono<{ Bindings: HttpBindings }>();

async function resolveRepo(owner: string, repoName: string) {
  // Strip .git suffix if present
  const name = repoName.replace(/\.git$/, "");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, owner))
    .limit(1);

  if (!user) return null;

  const [repo] = await db
    .select()
    .from(repositories)
    .where(
      and(eq(repositories.ownerId, user.id), eq(repositories.name, name)),
    )
    .limit(1);

  return repo ?? null;
}

// GET /:owner/:repo.git/info/refs?service=git-upload-pack|git-receive-pack
gitProtocolRoutes.get("/:owner/:repo/info/refs", async (c) => {
  const service = c.req.query("service") as ServiceType | undefined;
  if (
    !service ||
    !["git-upload-pack", "git-receive-pack"].includes(service)
  ) {
    return c.text("Invalid service", 400);
  }

  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  // For public repos, allow upload-pack (clone/fetch) without auth
  // For receive-pack (push), require auth (TODO: implement Basic auth check)

  const serviceType = service.replace("git-", "") as "upload-pack" | "receive-pack";
  handleInfoRefs(repo.diskPath, serviceType, c.env.outgoing);

  // Return undefined to let the stream handle the response
  return undefined as never;
});

// POST /:owner/:repo.git/git-upload-pack
gitProtocolRoutes.post("/:owner/:repo/git-upload-pack", async (c) => {
  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  handleServiceRpc(repo.diskPath, "upload-pack", c.env.incoming, c.env.outgoing);
  return undefined as never;
});

// POST /:owner/:repo.git/git-receive-pack
gitProtocolRoutes.post("/:owner/:repo/git-receive-pack", async (c) => {
  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return c.text("Repository not found", 404);

  // TODO: require auth for push
  handleServiceRpc(repo.diskPath, "receive-pack", c.env.incoming, c.env.outgoing);
  return undefined as never;
});
