"use server";

import { db, users } from "@groffee/db";
import { inArray } from "drizzle-orm";

/**
 * Batch-load user IDs → usernames in a single query.
 * Deduplicates IDs automatically.
 */
export async function batchLoadUsers(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, uniqueIds));

  return new Map(rows.map((u) => [u.id, u.username]));
}
