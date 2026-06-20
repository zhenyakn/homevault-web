/**
 * Tamper-evident audit hashing (compliance).
 *
 * Each audit entry stores `entryHash = sha256(prevHash + canonical(entry))`,
 * where `prevHash` is the previous entry's hash — a blockchain-style hash chain.
 * Altering or deleting any historical entry breaks every subsequent hash, which
 * `verifyAuditChain` detects and pinpoints. Pure functions only (no DB) so the
 * integrity logic is trivially unit-testable.
 */

import { createHash } from "crypto";

/** Chain anchor for the very first hashed entry. */
export const AUDIT_GENESIS = "0".repeat(64);

export interface AuditHashInput {
  actorUserId: number | null;
  tenantId: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: Date | string;
}

/** Deterministic JSON: object keys sorted recursively so hashing is stable. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`;
}

function normalize(e: AuditHashInput): Record<string, unknown> {
  return {
    actorUserId: e.actorUserId ?? null,
    tenantId: e.tenantId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    metadata: e.metadata ?? null,
    requestId: e.requestId ?? null,
    createdAt:
      e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
  };
}

/** Compute the SHA-256 hash of an entry chained onto `prevHash`. */
export function computeEntryHash(prevHash: string, e: AuditHashInput): string {
  return createHash("sha256")
    .update(prevHash)
    .update("\n")
    .update(canonical(normalize(e)))
    .digest("hex");
}

export interface ChainRow extends AuditHashInput {
  id: number;
  prevHash: string | null;
  entryHash: string | null;
}

export interface ChainVerifyResult {
  /** True when every hashed entry verifies and links correctly. */
  ok: boolean;
  /** Number of hash-chained entries checked. */
  verified: number;
  /** Legacy entries with no hash (created before the feature), skipped. */
  legacy: number;
  /** Id of the first entry that fails verification, if any. */
  brokenAtId?: number;
  reason?: string;
}

/**
 * Verify a full chain. Rows must be in ascending id order. Pre-feature rows
 * with no hash are tolerated (counted as `legacy`); the hashed chain is
 * verified contiguously, anchored at AUDIT_GENESIS.
 */
export function verifyAuditChain(rows: ChainRow[]): ChainVerifyResult {
  let verified = 0;
  let legacy = 0;
  let expectedPrev = AUDIT_GENESIS;
  let seenHashed = false;

  for (const row of rows) {
    if (row.entryHash == null) {
      if (seenHashed) {
        return {
          ok: false,
          verified,
          legacy,
          brokenAtId: row.id,
          reason: "unhashed entry after the chain began (possible deletion)",
        };
      }
      legacy++;
      continue;
    }
    seenHashed = true;

    if ((row.prevHash ?? AUDIT_GENESIS) !== expectedPrev) {
      return {
        ok: false,
        verified,
        legacy,
        brokenAtId: row.id,
        reason: "prevHash does not match the prior entry's hash",
      };
    }
    const recomputed = computeEntryHash(expectedPrev, row);
    if (recomputed !== row.entryHash) {
      return {
        ok: false,
        verified,
        legacy,
        brokenAtId: row.id,
        reason: "entryHash mismatch (entry was modified)",
      };
    }
    verified++;
    expectedPrev = row.entryHash;
  }

  return { ok: true, verified, legacy };
}
