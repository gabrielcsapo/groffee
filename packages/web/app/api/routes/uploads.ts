import { Hono } from "hono";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, createReadStream } from "node:fs";
import { stat, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { db, uploads } from "@groffee/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";
import { DATA_DIR } from "../lib/paths.js";

const UPLOADS_DIR = path.resolve(DATA_DIR, "uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

mkdirSync(UPLOADS_DIR, { recursive: true });

function uploadObjectPath(oid: string): string {
  return path.join(UPLOADS_DIR, oid.substring(0, 2), oid.substring(2, 4), oid);
}

export const uploadRoutes = new Hono<AppEnv>();

// POST /api/uploads — multipart/form-data with "file" field
uploadRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user") as { id: string };

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid multipart form data" }, 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "Missing 'file' field" }, 400);
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      {
        error: `Unsupported media type: ${file.type || "unknown"}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
      },
      415,
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes.` }, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes.` }, 413);
  }

  const oid = createHash("sha256").update(buffer).digest("hex");
  const objectPath = uploadObjectPath(oid);

  // Reuse existing file if same hash
  if (!existsSync(objectPath)) {
    mkdirSync(path.dirname(objectPath), { recursive: true });
    const tempPath = `${objectPath}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, buffer);
      await rename(tempPath, objectPath);
    } catch (err) {
      await unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  // Insert a row in uploads (one per upload event, even if content is reused).
  const filename = (file.name || "upload").slice(0, 255);
  await db.insert(uploads).values({
    id: crypto.randomUUID(),
    oid,
    filename,
    mimeType: file.type,
    sizeBytes: buffer.byteLength,
    uploadedById: user.id,
    createdAt: new Date(),
  });

  return c.json({
    url: `/api/uploads/${oid}`,
    filename,
    sizeBytes: buffer.byteLength,
    mimeType: file.type,
  });
});

// GET /api/uploads/:oid — public read (oid is unguessable sha256)
uploadRoutes.get("/:oid", async (c) => {
  const oid = c.req.param("oid");
  if (!/^[0-9a-f]{64}$/.test(oid)) {
    return c.json({ error: "Invalid OID format" }, 400);
  }

  const [record] = await db.select().from(uploads).where(eq(uploads.oid, oid)).limit(1);

  if (!record) return c.json({ error: "Not found" }, 404);

  const objectPath = uploadObjectPath(oid);
  if (!existsSync(objectPath)) return c.json({ error: "Not found" }, 404);

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
      "Content-Type": record.mimeType,
      "Content-Length": String(fileStat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
