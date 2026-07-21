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
import { logger, logBackgroundError } from "./app/api/lib/logger";
import { resolveRepositoryRedirect } from "./app/api/lib/repository-redirects";

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

  // Preserve old web, Pages, and Smart HTTP Git URLs after a repository
  // rename. A permanent 308 keeps the HTTP method/body for Git POSTs.
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const apiRepoPath = parts[0] === "api" && parts[1] === "repos" && parts.length >= 4;
    const ownerIndex = apiRepoPath ? 2 : 0;
    const repoIndex = apiRepoPath ? 3 : 1;
    if (parts.length > repoIndex && parts[0] !== "assets") {
      const oldName = parts[repoIndex].replace(/\.git$/, "");
      const newName = await resolveRepositoryRedirect(parts[ownerIndex], oldName);
      if (newName) {
        parts[repoIndex] = parts[repoIndex].endsWith(".git") ? `${newName}.git` : newName;
        url.pathname = `/${parts.join("/")}${c.req.path.endsWith("/") ? "/" : ""}`;
        // Keep redirects origin-relative. Behind a reverse proxy, c.req.url
        // contains the internal container origin, while the client must stay
        // on the public scheme and host. Relative Locations also preserve
        // authenticated Git clients and Pages hosts without trusting forwarded
        // headers.
        return c.redirect(`${url.pathname}${url.search}${url.hash}`, 308);
      }
    }
    return next();
  });

  // Pages subdomain middleware (must be first)
  app.use("*", async (c, next) => {
    if (isPagesRequest(c.req.header("host"))) {
      return await handlePagesRequest(c.req.url);
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
    logger.info("Groffee web server started", { source: "server", metadata: { port: info.port } });
  });

  // Start SSH server
  startSshServer();

  // Backfill indexes for existing repos (runs in background on startup)
  backfillIndexes().catch(logBackgroundError("Repository backfill failed", "server"));
}

main().catch(logBackgroundError("Groffee failed to start", "server"));
