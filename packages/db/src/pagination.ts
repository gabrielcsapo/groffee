/**
 * Cursor-based pagination primitives.
 *
 * Why cursor not offset:
 *   - Stable under concurrent inserts (offset shifts when rows appear above
 *     the current page; cursor pins to a row).
 *   - O(log n) seek vs O(offset + n) scan on indexed columns.
 *
 * Cursor shape: base64url-encoded JSON `{ ts, id }` where `ts` is the value of
 * the sort column (most often `createdAt` as ms since epoch) and `id` is the
 * row id used as a deterministic tie-breaker when many rows share the same
 * timestamp.
 *
 * Use:
 *   const { items, nextCursor } = paginatedResult(rows, limit);
 *   // SQL side: `where(cursorWhere(...))` + `orderBy(cursorOrderBy(...))`
 *
 * Every list endpoint should pair `cursorWhere` and `cursorOrderBy` against
 * the same `(sortColumn, idColumn, direction)` tuple. Drift between predicate
 * and ordering will silently skip or duplicate rows on page boundaries.
 */
import { and, asc, desc, eq, gt, lt, or, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export type SortDirection = "asc" | "desc";

export interface CursorPayload {
  ts: number;
  id: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.ts !== "number" || typeof parsed.id !== "string") {
      return null;
    }
    return { ts: parsed.ts, id: parsed.id };
  } catch {
    // Malformed cursor: treat as no-cursor, returning the first page is safer
    // than 400-ing on a stale bookmark.
    return null;
  }
}

/**
 * Returns a Drizzle WHERE predicate that selects rows STRICTLY past the cursor
 * in `direction`. Returns undefined when no cursor is supplied.
 *
 * Composable with other predicates via `and(...)`.
 */
export function cursorWhere(
  cursor: string | null | undefined,
  sortColumn: SQLiteColumn,
  idColumn: SQLiteColumn,
  direction: SortDirection = "desc",
): SQL | undefined {
  const decoded = decodeCursor(cursor);
  if (!decoded) return undefined;

  // SQLite stores Date columns as integer ms via Drizzle's timestamp mode.
  // Compare numerically; tie-break on id with the same direction.
  if (direction === "desc") {
    return or(
      lt(sortColumn, new Date(decoded.ts)),
      and(eq(sortColumn, new Date(decoded.ts)), lt(idColumn, decoded.id)),
    );
  }
  return or(
    gt(sortColumn, new Date(decoded.ts)),
    and(eq(sortColumn, new Date(decoded.ts)), gt(idColumn, decoded.id)),
  );
}

export function cursorOrderBy(
  sortColumn: SQLiteColumn,
  idColumn: SQLiteColumn,
  direction: SortDirection = "desc",
): SQL[] {
  if (direction === "desc") {
    return [desc(sortColumn), desc(idColumn)];
  }
  return [asc(sortColumn), asc(idColumn)];
}

/**
 * Build the result envelope from rows fetched with `LIMIT pageSize + 1`.
 *
 * The over-fetch by one row is how we know `hasMore` without a count query.
 * Caller passes the field name that holds the sort key (defaults to
 * `createdAt`) so we can emit a cursor pointing at the last returned row.
 */
export function paginatedResult<T extends { id: string }>(
  rows: T[],
  pageSize: number,
  sortField: keyof T = "createdAt" as keyof T,
): PaginatedResult<T> {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    const tsRaw = last[sortField] as unknown;
    const ts =
      tsRaw instanceof Date
        ? tsRaw.getTime()
        : typeof tsRaw === "string"
          ? new Date(tsRaw).getTime()
          : typeof tsRaw === "number"
            ? tsRaw
            : NaN;
    if (Number.isFinite(ts)) {
      nextCursor = encodeCursor({ ts, id: last.id });
    }
  }
  return { items, nextCursor, hasMore };
}
