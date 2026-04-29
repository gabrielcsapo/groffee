import { serve } from "@hono/node-server";
import { createServer } from "react-flight-router/server";
import { Hono } from "hono";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { requestStorage } from "./app/lib/server/request-context";
import { app as apiApp } from "./app/api/app";
import { startSshServer } from "./app/api/ssh-server";
import { backfillIndexes } from "./app/api/lib/backfill";
import { isPagesRequest, handlePagesRequest } from "./app/api/lib/pages-server";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

async function main() {
  const flightApp = await createServer({
    buildDir: "./dist",
    onRequest: (request) => {
      requestStorage.enterWith(request);
    },
  });

  const app = new Hono();

  // Pages subdomain middleware (must be first)
  app.use("*", async (c, next) => {
    if (isPagesRequest(c.req.header("host"))) {
      return handlePagesRequest(c.req.url);
    }
    return next();
  });

  // API routes (mounted before flight router catch-all)
  app.route("/", apiApp);

  // Serve public files from dist/client (favicon, manifest, etc.)
  app.use("*", async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    // Skip paths handled by other routes
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/_flight")
    ) {
      return next();
    }
    const ext = pathname.slice(pathname.lastIndexOf("."));
    if (ext && MIME_TYPES[ext]) {
      const filePath = resolve("./dist/client", pathname.slice(1));
      if (existsSync(filePath)) {
        const content = readFileSync(filePath);
        return new Response(content, {
          headers: {
            "Content-Type": MIME_TYPES[ext],
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
    return next();
  });

  // Flight router (handles /_flight, /_flight_action, /assets/*, and * for SSR)
  app.route("/", flightApp);

  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
    console.log(`Groffee running at http://localhost:${info.port}`);
  });

  // Start SSH server
  startSshServer();

  // Backfill indexes for existing repos (runs in background on startup)
  backfillIndexes().catch((err: unknown) => console.error("Backfill failed:", err));
}

main().catch(console.error);
