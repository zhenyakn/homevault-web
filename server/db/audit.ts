import { desc, eq } from "drizzle-orm";
import { auditLog, type AuditLogRow } from "../../drizzle/schema";
import { getDb } from "./client";
import { logger } from "../_core/logger";

/**
 * Append a security-relevant event to the audit log. Best-effort: a logging
 * failure must never abort the action that triggered it, so errors are swallowed
 * (and surfaced to the server log) rather than thrown.
 */
export async function logAudit(entry: {
  actorUserId?: number | null;
  tenantId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      actorUserId: entry.actorUserId ?? null,
      tenantId: entry.tenantId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    logger.error(
      { action: entry.action, err: (err as Error).message },
      "[audit] failed to write entry"
    );
  }
}

/** Most-recent audit entries for a tenant (for the admin/tenant console). */
export async function getAuditLogForTenant(
  tenantId: number,
  limit = 100
): Promise<AuditLogRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}
