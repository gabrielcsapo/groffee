import type { Plugin, ViteDevServer } from "vite";

/**
 * Vite plugin that serves the API routes (Hono app) during dev mode.
 * This replaces the need for a separate API server process and proxy config.
 *
 * Intercepts:
 * - /api/* requests → API Hono app
 * - /:owner/:repo.git/* requests → Git HTTP protocol routes
 */
export function apiMiddleware(): Plugin {
  return {
    name: "groffee:api-middleware",
    configureServer(server: ViteDevServer) {
      // Register middleware directly (pre-middleware) so it runs BEFORE
      // the flight router's catch-all which would otherwise match /api/* routes
      server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? "/";

          // Match /api/* routes
          const isApi = url.startsWith("/api/") || url === "/api";

          // Match git protocol routes: /:owner/:repo.git/*
          const isGitProtocol = /^\/[^/]+\/[^/]+\.git(\/|$)/.test(url);

          if (!isApi && !isGitProtocol) {
            return next();
          }

          try {
            // Use ssrLoadModule to load the API app with proper HMR support
            const mod = await server.ssrLoadModule("./app/api/app.ts");
            const apiApp = mod.app;

            if (!apiApp) {
              console.error("[api-middleware] Could not load API app");
              return next();
            }

            // Build a full URL from the incoming request
            const protocol = req.headers["x-forwarded-proto"] || "http";
            const host = req.headers.host || "localhost:3000";
            const fullUrl = `${protocol}://${host}${url}`;

            // Convert Node.js headers to Headers object
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (value) {
                headers.set(
                  key,
                  Array.isArray(value) ? value.join(", ") : value,
                );
              }
            }

            // Read the request body for non-GET/HEAD requests
            let body: ReadableStream<Uint8Array> | null = null;
            if (req.method !== "GET" && req.method !== "HEAD") {
              body = new ReadableStream({
                start(controller) {
                  req.on("data", (chunk: Buffer) => {
                    controller.enqueue(new Uint8Array(chunk));
                  });
                  req.on("end", () => {
                    controller.close();
                  });
                  req.on("error", (err) => {
                    controller.error(err);
                  });
                },
              });
            }

            // Create a standard Request
            const request = new Request(fullUrl, {
              method: req.method ?? "GET",
              headers,
              body,
              // @ts-expect-error - Node.js duplex option needed for streaming body
              duplex: body ? "half" : undefined,
            });

            // Pass to Hono app
            const response = await apiApp.fetch(request);

            // Write the response back to Node.js res
            res.statusCode = response.status;
            response.headers.forEach((value: string, key: string) => {
              // Skip transfer-encoding since we handle it ourselves
              if (key.toLowerCase() !== "transfer-encoding") {
                res.setHeader(key, value);
              }
            });

            if (response.body) {
              const reader = response.body.getReader();
              const pump = async () => {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    res.end();
                    break;
                  }
                  res.write(value);
                }
              };
              await pump();
            } else {
              const text = await response.text();
              res.end(text);
            }
          } catch (err) {
            console.error("[api-middleware] Error handling request:", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end("Internal Server Error");
            }
          }
        });
    },
  };
}
