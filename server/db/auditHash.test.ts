import { describe, it, expect } from "vitest";
import {
  AUDIT_GENESIS,
  computeEntryHash,
  verifyAuditChain,
  type ChainRow,
} from "./auditHash";

type EntryFields = Omit<ChainRow, "id" | "prevHash" | "entryHash">;

function entry(over: Partial<EntryFields> = {}): EntryFields {
  return {
    actorUserId: 1,
    tenantId: null,
    action: "admin.user.created",
    targetType: "user",
    targetId: "5",
    metadata: { email: "a@b.c" },
    requestId: "req_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

/** Build a valid, linked chain of `n` entries. */
function buildChain(n: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = AUDIT_GENESIS;
  for (let i = 1; i <= n; i++) {
    const base = entry({ targetId: String(i), action: `action.${i}` });
    const entryHash = computeEntryHash(prev, base);
    rows.push({ id: i, prevHash: prev, entryHash, ...base });
    prev = entryHash;
  }
  return rows;
}

describe("audit hash chain", () => {
  it("is deterministic regardless of metadata key order", () => {
    const a = computeEntryHash(AUDIT_GENESIS, entry({ metadata: { x: 1, y: 2 } }));
    const b = computeEntryHash(AUDIT_GENESIS, entry({ metadata: { y: 2, x: 1 } }));
    expect(a).toBe(b);
  });

  it("verifies a well-formed chain", () => {
    const result = verifyAuditChain(buildChain(5));
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(5);
    expect(result.legacy).toBe(0);
  });

  it("detects a modified entry", () => {
    const chain = buildChain(5);
    // Tamper with entry 3's action without recomputing hashes.
    chain[2].action = "action.tampered";
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe(3);
  });

  it("detects a deleted entry (broken link)", () => {
    const chain = buildChain(5);
    chain.splice(2, 1); // remove entry id 3
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    // Entry 4 now fails because its prevHash points at the removed entry 3.
    expect(result.brokenAtId).toBe(4);
  });

  it("tolerates legacy un-hashed rows before the chain begins", () => {
    const legacy: ChainRow[] = [
      { id: 1, prevHash: null, entryHash: null, ...entry() },
      { id: 2, prevHash: null, entryHash: null, ...entry() },
    ];
    const chain = buildChain(3).map((r, i) => ({ ...r, id: i + 3 }));
    // Re-link the first hashed row onto genesis (already is) and fix ids.
    const result = verifyAuditChain([...legacy, ...chain]);
    expect(result.ok).toBe(true);
    expect(result.legacy).toBe(2);
    expect(result.verified).toBe(3);
  });

  it("flags an un-hashed row appearing after the chain began (deletion cover-up)", () => {
    const chain = buildChain(3);
    chain.push({ id: 4, prevHash: null, entryHash: null, ...entry() });
    const result = verifyAuditChain(chain);
    expect(result.ok).toBe(false);
    expect(result.brokenAtId).toBe(4);
  });
});
