"use server";

import { db, users, uploads, repositories } from "@groffee/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "./session";
import { logAudit, getClientIp } from "./audit";
import { getRequest } from "./request-context";

const MAX_BIO_LENGTH = 280;
const MAX_LOCATION_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_WEBSITE_LENGTH = 200;

/**
 * Update the current user's avatar to point at an upload OID. The OID must
 * already exist in the `uploads` table (i.e. the file was POSTed to
 * `/api/uploads`). We only check for existence — not original uploader —
 * because uploads are content-addressed and a user could legitimately reuse
 * an avatar another user uploaded (rare, but possible).
 */
export async function updateUserAvatar(opts: {
  uploadOid: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };

  const oid = opts.uploadOid?.trim();
  if (!oid || !/^[0-9a-f]{64}$/.test(oid)) {
    return { error: "Invalid upload OID" };
  }

  const [upload] = await db.select().from(uploads).where(eq(uploads.oid, oid)).limit(1);
  if (!upload) return { error: "Upload not found" };
  if (!upload.mimeType.startsWith("image/")) {
    return { error: "Upload is not an image" };
  }

  await db
    .update(users)
    .set({ avatarUploadId: oid, updatedAt: new Date() })
    .where(eq(users.id, sessionUser.id));

  const req = getRequest();
  logAudit({
    userId: sessionUser.id,
    action: "user.avatar_update",
    targetType: "user",
    targetId: sessionUser.id,
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { ok: true };
}

export async function removeUserAvatar(): Promise<{ ok?: boolean; error?: string }> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };

  await db
    .update(users)
    .set({ avatarUploadId: null, updatedAt: new Date() })
    .where(eq(users.id, sessionUser.id));

  const req = getRequest();
  logAudit({
    userId: sessionUser.id,
    action: "user.avatar_remove",
    targetType: "user",
    targetId: sessionUser.id,
    ipAddress: req ? getClientIp(req) : "unknown",
  }).catch(console.error);

  return { ok: true };
}

function isLikelyUrl(s: string): boolean {
  if (!s) return false;
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    return /\./.test(url.hostname);
  } catch {
    return false;
  }
}

export async function updateUserProfile(updates: {
  displayName?: string | null;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };

  const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.displayName !== undefined) {
    const v = updates.displayName?.trim() || null;
    if (v && v.length > MAX_DISPLAY_NAME_LENGTH) {
      return { error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer` };
    }
    dbUpdates.displayName = v;
  }

  if (updates.bio !== undefined) {
    const v = updates.bio?.trim() || null;
    if (v && v.length > MAX_BIO_LENGTH) {
      return { error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer` };
    }
    dbUpdates.bio = v;
  }

  if (updates.website !== undefined) {
    const v = updates.website?.trim() || null;
    if (v) {
      if (v.length > MAX_WEBSITE_LENGTH) {
        return { error: `Website must be ${MAX_WEBSITE_LENGTH} characters or fewer` };
      }
      if (!isLikelyUrl(v)) return { error: "Website must be a valid URL" };
    }
    dbUpdates.website = v;
  }

  if (updates.location !== undefined) {
    const v = updates.location?.trim() || null;
    if (v && v.length > MAX_LOCATION_LENGTH) {
      return { error: `Location must be ${MAX_LOCATION_LENGTH} characters or fewer` };
    }
    dbUpdates.location = v;
  }

  await db.update(users).set(dbUpdates).where(eq(users.id, sessionUser.id));
  return { ok: true };
}

/**
 * Public user-page payload: profile fields + that user's visible repos.
 * Visible = public repos always; the owner additionally sees their private
 * repos when viewing their own page.
 */
export async function getUserPage(ownerName: string): Promise<{
  user?: {
    username: string;
    displayName: string | null;
    bio: string | null;
    website: string | null;
    location: string | null;
    avatarUploadId: string | null;
    createdAt: string;
  };
  repositories?: Array<{
    id: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    updatedAt: string;
  }>;
  error?: string;
}> {
  const [user] = await db.select().from(users).where(eq(users.username, ownerName)).limit(1);
  if (!user) return { error: "User not found" };

  const sessionUser = await getSessionUser();
  const isOwner = sessionUser?.id === user.id;

  const repos = isOwner
    ? await db.select().from(repositories).where(eq(repositories.ownerId, user.id))
    : await db
        .select()
        .from(repositories)
        .where(and(eq(repositories.ownerId, user.id), eq(repositories.isPublic, true)));

  return {
    user: {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      website: user.website,
      location: user.location,
      avatarUploadId: user.avatarUploadId,
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    },
    repositories: repos.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isPublic: r.isPublic,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    })),
  };
}

export async function getCurrentUserProfile(): Promise<{
  user?: {
    username: string;
    email: string;
    displayName: string | null;
    bio: string | null;
    website: string | null;
    location: string | null;
    avatarUploadId: string | null;
  };
  error?: string;
}> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { error: "Unauthorized" };

  const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!user) return { error: "User not found" };

  return {
    user: {
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      website: user.website,
      location: user.location,
      avatarUploadId: user.avatarUploadId,
    },
  };
}
