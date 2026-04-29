import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PAGES_DIR, PAGES_HOSTNAME } from "./paths.js";

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
  ".map": "application/json",
};

export function isPagesRequest(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.replace(/:\d+$/, "");
  return hostname === PAGES_HOSTNAME;
}

export function handlePagesRequest(url: string): Response {
  const pathname = new URL(url, "http://localhost").pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length < 2) {
    return new Response("Not Found — URL should be /{owner}/{repo}/", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const [owner, repo, ...rest] = segments;
  const filePath = rest.join("/") || "index.html";
  const baseDir = resolve(PAGES_DIR, owner, repo, "live");

  if (!existsSync(baseDir)) {
    return new Response("Pages not deployed for this repository", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Try: exact path, path/index.html, root index.html
  const candidates = [filePath, `${filePath}/index.html`];
  // Only add root fallback if we're not already requesting a file with extension
  if (!filePath.includes(".")) {
    candidates.push("index.html");
  }

  for (const candidate of candidates) {
    const fullPath = resolve(baseDir, candidate);
    // Security: prevent path traversal
    if (!fullPath.startsWith(baseDir)) continue;
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath);
        const ext = candidate.slice(candidate.lastIndexOf("."));
        const mimeType = MIME_TYPES[ext] || "application/octet-stream";
        const cacheControl = ext === ".html" ? "public, max-age=3600" : "public, max-age=86400";
        return new Response(content, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": cacheControl,
          },
        });
      } catch {
        continue;
      }
    }
  }

  // Custom 404
  const custom404 = resolve(baseDir, "404.html");
  if (existsSync(custom404)) {
    try {
      const content = readFileSync(custom404);
      return new Response(content, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    } catch {
      // fall through
    }
  }

  return new Response("404 — Page not found", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
}
