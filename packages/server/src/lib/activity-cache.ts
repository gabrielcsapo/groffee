import { db, repoActivityCache } from "@groffee/db";
import { eq, and } from "drizzle-orm";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getCachedActivity(
  repoId: string,
  cacheKey: string,
  authorFilter: string | null,
): Promise<object | null> {
  const filterValue = authorFilter ?? "__all__";
  const [entry] = await db
    .select()
    .from(repoActivityCache)
    .where(
      and(
        eq(repoActivityCache.repoId, repoId),
        eq(repoActivityCache.cacheKey, cacheKey),
        eq(repoActivityCache.authorFilter, filterValue),
      ),
    )
    .limit(1);

  if (!entry) return null;
  if (Date.now() - entry.computedAt.getTime() > CACHE_TTL_MS) return null;
  return JSON.parse(entry.data);
}

export async function setCachedActivity(
  repoId: string,
  cacheKey: string,
  authorFilter: string | null,
  data: object,
): Promise<void> {
  const filterValue = authorFilter ?? "__all__";
  const now = new Date();

  await db
    .insert(repoActivityCache)
    .values({
      id: crypto.randomUUID(),
      repoId,
      cacheKey,
      data: JSON.stringify(data),
      authorFilter: filterValue,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: [repoActivityCache.repoId, repoActivityCache.cacheKey, repoActivityCache.authorFilter],
      set: {
        data: JSON.stringify(data),
        computedAt: now,
      },
    });
}

export async function invalidateActivityCache(repoId: string): Promise<void> {
  await db.delete(repoActivityCache).where(eq(repoActivityCache.repoId, repoId));
}
