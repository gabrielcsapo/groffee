import { db, systemLogs, auditLogs } from "@groffee/db";
import { sql } from "drizzle-orm";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  requestId?: string;
  userId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  method?: string;
  path?: string;
  statusCode?: number;
}

const LOG_RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

class Logger {
  constructor() {
    // Run cleanup on startup (deferred) and then periodically
    setTimeout(() => this.cleanupOldLogs(), 10_000);
    setInterval(() => this.cleanupOldLogs(), CLEANUP_INTERVAL_MS);
  }

  private write(level: LogLevel, message: string, opts?: LogOptions) {
    // Write to DB (fire-and-forget)
    try {
      db.insert(systemLogs)
        .values({
          id: crypto.randomUUID(),
          level,
          message,
          metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
          requestId: opts?.requestId ?? null,
          userId: opts?.userId ?? null,
          source: opts?.source ?? null,
          duration: opts?.duration ?? null,
          method: opts?.method ?? null,
          path: opts?.path ?? null,
          statusCode: opts?.statusCode ?? null,
          createdAt: new Date(),
        })
        .catch(() => {});
    } catch {
      // Never fail the caller
    }

    // Also log to console
    const prefix = `[${level.toUpperCase()}]`;
    const meta = opts?.requestId ? ` [${opts.requestId.slice(0, 8)}]` : "";
    const src = opts?.source ? ` (${opts.source})` : "";
    if (level === "error") {
      console.error(`${prefix}${meta}${src} ${message}`);
    } else if (level === "warn") {
      console.warn(`${prefix}${meta}${src} ${message}`);
    } else {
      console.log(`${prefix}${meta}${src} ${message}`);
    }
  }

  /** Delete system_logs and audit_logs older than LOG_RETENTION_DAYS */
  private cleanupOldLogs() {
    try {
      const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      db.delete(systemLogs)
        .where(sql`${systemLogs.createdAt} < ${cutoff}`)
        .run();
      db.delete(auditLogs)
        .where(sql`${auditLogs.createdAt} < ${cutoff}`)
        .run();
    } catch {
      // Non-fatal
    }
  }

  info(message: string, opts?: LogOptions) {
    this.write("info", message, opts);
  }

  warn(message: string, opts?: LogOptions) {
    this.write("warn", message, opts);
  }

  error(message: string, opts?: LogOptions) {
    this.write("error", message, opts);
  }

  debug(message: string, opts?: LogOptions) {
    this.write("debug", message, opts);
  }
}

export const logger = new Logger();
