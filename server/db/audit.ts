import { asc, desc, eq } from "drizzle-orm";
import { auditLog, type AuditLogRow } from "../../drizzle/schema";
import { getDb } from "./client";
import { logger } from "../_core/logger";
import { getContext } from "../_core/observability";
import {
  AUDIT_GENESIS,
  computeEntryHash,
  verifyAuditChain,
  type ChainRow,
  type ChainVerifyResult,
} from "./auditHash";

/**
 * Append a security-relevant event to the audit log. Best-effort: a logging
 * failure must never abort the action that triggered it, so errors are swallowed
 * (and surfaced to the server log) rather than thrown.
 *
 * Entries are tamper-evident: each is hash-chained onto the previous one (see
 * auditHash.ts), and stamped with the originating request id so the audit trail
 * correlates with the operational logs / traces. The chain head is read and the
 * new row written inside a transaction with a row lock so concurrent writers
 * can't fork the chain.
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
    const requestId = getContext()?.requestId ?? null;
    const createdAt = new Date();
    const hashInput = {
      actorUserId: entry.actorUserId ?? null,
      tenantId: entry.tenantId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
      requestId,
      createdAt,
    };

    await db.transaction(async tx => {
      // Lock the current chain head so two concurrent writers serialize onto
      // the same prevHash rather than forking.
      const [last] = await tx
        .select({ entryHash: auditLog.entryHash })
        .from(auditLog)
        .orderBy(desc(auditLog.id))
        .limit(1)
        .for("update");
      const prevHash = last?.entryHash ?? AUDIT_GENESIS;
      const entryHash = computeEntryHash(prevHash, hashInput);

      await tx.insert(auditLog).values({
        ...hashInput,
        prevHash,
        entryHash,
        createdAt,
      });
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

/**
 * Verify the integrity of the entire audit hash chain. Walks every entry in id
 * order and recomputes the chain; any modified, reordered, or deleted entry is
 * detected and pinpointed by id.
 */
export async function verifyAuditIntegrity(): Promise<ChainVerifyResult> {
  const db = await getDb();
  const rows = (await db
    .select()
    .from(auditLog)
    .orderBy(asc(auditLog.id))) as ChainRow[];
  return verifyAuditChain(rows);
}
