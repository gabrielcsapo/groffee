import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  const method = c.req.method;
  const path = c.req.path;
  const status = c.res.status;
  const requestId = c.get("requestId") as string | undefined;

  logger.info(`${method} ${path} ${status} ${duration}ms`, {
    requestId,
    method,
    path,
    statusCode: status,
    duration,
    source: "http",
  });
});
