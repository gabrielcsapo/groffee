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

export interface UserProfile {
  username: string;
  displayName: string | null;
  avatarUploadId: string | null;
}

/**
 * Batch-load user IDs → user profile (username + display name + avatar) in
 * a single query. Use this when the caller renders an Avatar — `batchLoadUsers`
 * only returns username, so any caller that needs `<Avatar user=...>` would
 * otherwise have to make a second query per author.
 */
export async function batchLoadUserProfiles(ids: string[]): Promise<Map<string, UserProfile>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUploadId: users.avatarUploadId,
    })
    .from(users)
    .where(inArray(users.id, uniqueIds));

  return new Map(
    rows.map((u) => [
      u.id,
      {
        username: u.username,
        displayName: u.displayName ?? null,
        avatarUploadId: u.avatarUploadId ?? null,
      },
    ]),
  );
}
