import { Hono } from "hono";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, createReadStream, createWriteStream } from "node:fs";
import { stat, unlink, rename } from "node:fs/promises";
import path from "node:path";
import { db, lfsObjects } from "@groffee/db";
import { eq, and, inArray } from "drizzle-orm";
import { authenticateGitUser, authChallenge, resolveRepo } from "../lib/git-auth.js";
import { canPush, canRead } from "../lib/permissions.js";

const LFS_CONTENT_TYPE = "application/vnd.git-lfs+json";
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const LFS_STORAGE_DIR = path.resolve(DATA_DIR, "lfs-objects");

mkdirSync(LFS_STORAGE_DIR, { recursive: true });

function lfsObjectPath(oid: string): string {
  return path.join(LFS_STORAGE_DIR, oid.substring(0, 2), oid.substring(2, 4), oid);
}

function lfsError(status: number, message: string) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": LFS_CONTENT_TYPE },
  });
}

export const gitLfsRoutes = new Hono();

// POST /:owner/:repo.git/info/lfs/objects/batch
gitLfsRoutes.post("/:owner/:repo/info/lfs/objects/batch", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.includes("application/vnd.git-lfs+json")) {
    return lfsError(406, "Expected application/vnd.git-lfs+json Content-Type");
  }

  const owner = c.req.param("owner");
  const repoParam = c.req.param("repo");

  const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
  if (!user) return authChallenge();

  const repo = await resolveRepo(owner, repoParam);
  if (!repo) return lfsError(404, "Repository not found");

  const body = await c.req.json<{
    operation: "upload" | "download";
    transfers?: string[];
    objects: Array<{ oid: string; size: number }>;
  }>();

  if (body.transfers && body.transfers.length > 0 && !body.transfers.includes("basic")) {
    return lfsError(422, "Only basic transfer adapter is supported");
  }

  if (body.operation === "upload") {
    if (!(await canPush(user.id, repo.id))) {
      return lfsError(403, "Permission denied");
    }
  } else if (body.operation === "download") {
    if (!(await canRead(user.id, repo.id))) {
      return lfsError(403, "Permission denied");
    }
  } else {
    return lfsError(422, "Invalid operation");
  }

  if (!body.objects || body.objects.length === 0) {
    return new Response(JSON.stringify({ transfer: "basic", objects: [] }), {
      status: 200,
      headers: { "Content-Type": LFS_CONTENT_TYPE },
    });
  }

  // Batch lookup existing OIDs
  const requestedOids = body.objects.map((o) => o.oid);
  const existingRecords = await db
    .select({ oid: lfsObjects.oid, size: lfsObjects.size })
    .from(lfsObjects)
    .where(and(eq(lfsObjects.repoId, repo.id), inArray(lfsObjects.oid, requestedOids)));

  const existingSet = new Map(existingRecords.map((r) => [r.oid, r.size]));

  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}/${owner}/${repoParam}`;
  const authHeader = c.req.header("Authorization");

  const responseObjects = body.objects.map((obj) => {
    const exists = existingSet.has(obj.oid);

    if (body.operation === "upload") {
      if (exists) {
        return { oid: obj.oid, size: obj.size };
      }
      return {
        oid: obj.oid,
        size: obj.size,
        actions: {
          upload: {
            href: `${baseUrl}/info/lfs/objects/${obj.oid}`,
            header: authHeader ? { Authorization: authHeader } : {},
            expires_in: 3600,
          },
          verify: {
            href: `${baseUrl}/info/lfs/verify`,
            header: authHeader ? { Authorization: authHeader } : {},
            expires_in: 3600,
          },
        },
      };
    } else {
      // download
      if (!exists) {
        return {
          oid: obj.oid,
          size: obj.size,
          error: { code: 404, message: "Object not found" },
        };
      }
      return {
        oid: obj.oid,
        size: obj.size,
        actions: {
          download: {
            href: `${baseUrl}/info/lfs/objects/${obj.oid}`,
            header: authHeader ? { Authorization: authHeader } : {},
            expires_in: 3600,
          },
        },
      };
    }
  });

  return new Response(JSON.stringify({ transfer: "basic", objects: responseObjects }), {
    status: 200,
    headers: { "Content-Type": LFS_CONTENT_TYPE },
  });
});

// PUT /:owner/:repo.git/info/lfs/objects/:oid
gitLfsRoutes.put("/:owner/:repo/info/lfs/objects/:oid", async (c) => {
  const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
  if (!user) return authChallenge();

  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return lfsError(404, "Repository not found");

  if (!(await canPush(user.id, repo.id))) {
    return lfsError(403, "Permission denied");
  }

  const oid = c.req.param("oid");
  if (!/^[0-9a-f]{64}$/.test(oid)) {
    return lfsError(422, "Invalid OID format");
  }

  const objectPath = lfsObjectPath(oid);

  // Idempotent: if already stored, skip
  const [existing] = await db
    .select()
    .from(lfsObjects)
    .where(and(eq(lfsObjects.repoId, repo.id), eq(lfsObjects.oid, oid)))
    .limit(1);

  if (existing && existsSync(objectPath)) {
    return c.body(null, 200);
  }

  const objectDir = path.dirname(objectPath);
  mkdirSync(objectDir, { recursive: true });

  const tempPath = `${objectPath}.${crypto.randomUUID()}.tmp`;
  const hash = createHash("sha256");
  let size = 0;

  const body = c.req.raw.body;
  if (!body) return lfsError(422, "Missing request body");

  const reader = body.getReader();
  const fileHandle = createWriteStream(tempPath);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      size += value.byteLength;
      if (!fileHandle.write(value)) {
        await new Promise<void>((resolve) => fileHandle.once("drain", resolve));
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileHandle.end(() => resolve());
      fileHandle.on("error", reject);
    });

    const computedOid = hash.digest("hex");
    if (computedOid !== oid) {
      await unlink(tempPath).catch(() => {});
      return lfsError(422, `OID mismatch: expected ${oid}, got ${computedOid}`);
    }

    await rename(tempPath, objectPath);

    if (!existing) {
      await db
        .insert(lfsObjects)
        .values({
          id: crypto.randomUUID(),
          repoId: repo.id,
          oid,
          size,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }

    return c.body(null, 200);
  } catch (err) {
    await unlink(tempPath).catch(() => {});
    throw err;
  }
});

// GET /:owner/:repo.git/info/lfs/objects/:oid
gitLfsRoutes.get("/:owner/:repo/info/lfs/objects/:oid", async (c) => {
  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return lfsError(404, "Repository not found");

  if (!repo.isPublic) {
    const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
    if (!user) return authChallenge();
    if (!(await canRead(user.id, repo.id))) {
      return lfsError(404, "Not found");
    }
  }

  const oid = c.req.param("oid");
  if (!/^[0-9a-f]{64}$/.test(oid)) {
    return lfsError(422, "Invalid OID format");
  }

  const [record] = await db
    .select()
    .from(lfsObjects)
    .where(and(eq(lfsObjects.repoId, repo.id), eq(lfsObjects.oid, oid)))
    .limit(1);

  if (!record) return lfsError(404, "Object not found");

  const objectPath = lfsObjectPath(oid);
  if (!existsSync(objectPath)) {
    return lfsError(404, "Object not found on disk");
  }

  const fileStat = await stat(objectPath);
  const nodeStream = createReadStream(objectPath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileStat.size),
    },
  });
});

// POST /:owner/:repo.git/info/lfs/verify
gitLfsRoutes.post("/:owner/:repo/info/lfs/verify", async (c) => {
  const user = await authenticateGitUser(c.req.header("Authorization") ?? null);
  if (!user) return authChallenge();

  const repo = await resolveRepo(c.req.param("owner"), c.req.param("repo"));
  if (!repo) return lfsError(404, "Repository not found");

  if (!(await canPush(user.id, repo.id))) {
    return lfsError(403, "Permission denied");
  }

  const body = await c.req.json<{ oid: string; size: number }>();

  if (!body.oid || typeof body.size !== "number") {
    return lfsError(422, "Invalid verify request");
  }

  const [record] = await db
    .select()
    .from(lfsObjects)
    .where(and(eq(lfsObjects.repoId, repo.id), eq(lfsObjects.oid, body.oid)))
    .limit(1);

  if (!record) return lfsError(404, "Object not found");

  if (record.size !== body.size) {
    return lfsError(422, `Size mismatch: expected ${body.size}, got ${record.size}`);
  }

  const objectPath = lfsObjectPath(body.oid);
  if (!existsSync(objectPath)) {
    return lfsError(404, "Object not found on disk");
  }

  return c.body(null, 200);
});
