"use server";

import { db, editHistory, users } from "@groffee/db";
import { eq, desc, inArray } from "drizzle-orm";

export async function getEditHistory(
  targetType: "issue" | "pull_request" | "comment",
  targetId: string,
) {
  const condition =
    targetType === "issue"
      ? eq(editHistory.issueId, targetId)
      : targetType === "pull_request"
        ? eq(editHistory.pullRequestId, targetId)
        : eq(editHistory.commentId, targetId);

  const edits = await db
    .select()
    .from(editHistory)
    .where(condition)
    .orderBy(desc(editHistory.createdAt));

  if (edits.length === 0) return [];

  // Attach editor usernames
  const editorIds = [...new Set(edits.map((e) => e.editedById))];
  const editors = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, editorIds));
  const editorMap = new Map(editors.map((u) => [u.id, u.username]));

  return edits.map((e) => ({
    id: e.id,
    previousTitle: e.previousTitle,
    previousBody: e.previousBody,
    editedBy: editorMap.get(e.editedById) || "unknown",
    createdAt: e.createdAt?.toISOString() || null,
  }));
}
