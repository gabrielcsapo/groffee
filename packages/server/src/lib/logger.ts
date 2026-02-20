import { db, systemLogs } from "@groffee/db";

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

class Logger {
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
