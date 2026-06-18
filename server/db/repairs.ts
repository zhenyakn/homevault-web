import { eq, desc, and, inArray } from "drizzle-orm";
import {
  repairs,
  repairQuotes,
  repairQuotePayments,
  type Repair,
  type RepairQuote,
  type RepairQuotePayment,
} from "../../drizzle/schema";
import { getDb } from "./client";

export type RepairQuoteWithPayments = RepairQuote & {
  payments: RepairQuotePayment[];
};

export async function getRepairs(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(repairs)
    .where(
      and(eq(repairs.tenantId, tenantId), eq(repairs.propertyId, propertyId))
    )
    .orderBy(desc(repairs.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getRepairById(id: string, tenantId?: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(repairs)
    .where(
      tenantId == null
        ? eq(repairs.id, id)
        : and(eq(repairs.id, id), eq(repairs.tenantId, tenantId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function filterTenantRepairIds(
  ids: string[],
  tenantId: number
): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: repairs.id })
    .from(repairs)
    .where(and(inArray(repairs.id, ids), eq(repairs.tenantId, tenantId)));
  return rows.map(r => r.id);
}

export async function createRepair(data: typeof repairs.$inferInsert) {
  const db = await getDb();
  await db
    .insert(repairs)
    .values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateRepair(
  id: string,
  tenantId: number,
  data: Partial<Repair>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(repairs)
    .set(normalized)
    .where(and(eq(repairs.id, id), eq(repairs.tenantId, tenantId)));
  return data;
}

export async function deleteRepair(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(repairs)
    .where(and(eq(repairs.id, id), eq(repairs.tenantId, tenantId)));
  return true;
}

// ── Repair Quotes ─────────────────────────────────────────────────────────────

async function attachPayments(
  quoteRows: RepairQuote[]
): Promise<RepairQuoteWithPayments[]> {
  if (quoteRows.length === 0) return [];
  const db = await getDb();
  const ids = quoteRows.map(q => q.id);
  const payRows = await db
    .select()
    .from(repairQuotePayments)
    .where(inArray(repairQuotePayments.quoteId, ids))
    .orderBy(repairQuotePayments.date);
  const byQuote: Record<string, RepairQuotePayment[]> = {};
  for (const p of payRows) {
    (byQuote[p.quoteId] ??= []).push(p);
  }
  return quoteRows.map(q => ({ ...q, payments: byQuote[q.id] ?? [] }));
}

export async function getRepairQuotes(
  repairId: string
): Promise<RepairQuoteWithPayments[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(repairQuotes)
    .where(eq(repairQuotes.repairId, repairId))
    .orderBy(repairQuotes.createdAt);
  return attachPayments(rows);
}

export async function getRepairQuoteCounts(repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      repairId: repairQuotes.repairId,
      selected: repairQuotes.selected,
    })
    .from(repairQuotes)
    .where(inArray(repairQuotes.repairId, repairIds));

  const map: Record<string, { total: number; hasSelected: boolean }> = {};
  for (const row of rows) {
    if (!map[row.repairId])
      map[row.repairId] = { total: 0, hasSelected: false };
    map[row.repairId].total++;
    if (row.selected) map[row.repairId].hasSelected = true;
  }
  return Object.entries(map).map(([repairId, c]) => ({ repairId, ...c }));
}

export async function getRepairQuoteById(id: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(repairQuotes)
    .where(eq(repairQuotes.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function createRepairQuote(
  data: typeof repairQuotes.$inferInsert
) {
  const db = await getDb();
  await db.insert(repairQuotes).values(data);
  return data;
}

export async function updateRepairQuote(
  id: string,
  data: Partial<RepairQuote>
) {
  const db = await getDb();
  await db.update(repairQuotes).set(data).where(eq(repairQuotes.id, id));
  return data;
}

export async function selectRepairQuote(repairId: string, quoteId: string) {
  const db = await getDb();
  await db.transaction(async tx => {
    await tx
      .update(repairQuotes)
      .set({ selected: false })
      .where(eq(repairQuotes.repairId, repairId));
    await tx
      .update(repairQuotes)
      .set({ selected: true })
      .where(eq(repairQuotes.id, quoteId));
  });
}

export async function deleteRepairQuote(id: string) {
  const db = await getDb();
  await db.delete(repairQuotes).where(eq(repairQuotes.id, id));
  return true;
}

// ── Repair quote payments ─────────────────────────────────────────────────────

export async function getRepairQuotePayments(
  quoteId: string
): Promise<RepairQuotePayment[]> {
  const db = await getDb();
  return await db
    .select()
    .from(repairQuotePayments)
    .where(eq(repairQuotePayments.quoteId, quoteId))
    .orderBy(repairQuotePayments.date);
}

export async function createRepairQuotePayment(
  data: typeof repairQuotePayments.$inferInsert
): Promise<RepairQuotePayment> {
  const db = await getDb();
  await db.insert(repairQuotePayments).values(data);
  return data as RepairQuotePayment;
}

export async function deleteRepairQuotePayment(id: string, quoteId: string) {
  const db = await getDb();
  await db
    .delete(repairQuotePayments)
    .where(
      and(
        eq(repairQuotePayments.id, id),
        eq(repairQuotePayments.quoteId, quoteId)
      )
    );
  return true;
}
