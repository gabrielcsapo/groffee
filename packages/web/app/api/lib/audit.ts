import { db, auditLogs } from "@groffee/db";

export async function logAudit(params: {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    ipAddress: params.ipAddress || null,
    createdAt: new Date(),
  });
}

export function getClientIp(headers: { get(name: string): string | null | undefined }): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
