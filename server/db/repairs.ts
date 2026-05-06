import { eq, desc, and, inArray } from "drizzle-orm";
import { repairs, repairQuotes, type Repair, type RepairQuote } from "../../drizzle/schema";
import { getDb, parseJsonArray } from "./client";

export async function getRepairs(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(repairs)
    .where(and(eq(repairs.ownerId, userId), eq(repairs.propertyId, propertyId)))
    .orderBy(desc(repairs.createdAt));
}

export async function getRepairById(id: string) {
  const db = await getDb();
  const result = await db.select().from(repairs).where(eq(repairs.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createRepair(data: typeof repairs.$inferInsert) {
  const db = await getDb();
  await db.insert(repairs).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateRepair(id: string, ownerId: number, data: Partial<Repair>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(repairs).set(normalized).where(and(eq(repairs.id, id), eq(repairs.ownerId, ownerId)));
  return data;
}

export async function deleteRepair(id: string, ownerId: number) {
  const db = await getDb();
  await db.delete(repairs).where(and(eq(repairs.id, id), eq(repairs.ownerId, ownerId)));
  return true;
}

// ─── Repair Quotes ────────────────────────────────────────────────────────────

export async function getRepairQuotes(repairId: string) {
  const db = await getDb();
  const rows = await db.select().from(repairQuotes).where(eq(repairQuotes.repairId, repairId)).orderBy(repairQuotes.createdAt);
  return rows.map(r => ({ ...r, payments: parseJsonArray(r.payments) }));
}

export async function getRepairQuoteCounts(repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ repairId: repairQuotes.repairId, selected: repairQuotes.selected })
    .from(repairQuotes)
    .where(inArray(repairQuotes.repairId, repairIds));

  const map: Record<string, { total: number; hasSelected: boolean }> = {};
  for (const row of rows) {
    if (!map[row.repairId]) map[row.repairId] = { total: 0, hasSelected: false };
    map[row.repairId].total++;
    if (row.selected) map[row.repairId].hasSelected = true;
  }
  return Object.entries(map).map(([repairId, c]) => ({ repairId, ...c }));
}

export async function getRepairQuoteById(id: string) {
  const db = await getDb();
  const result = await db.select().from(repairQuotes).where(eq(repairQuotes.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createRepairQuote(data: typeof repairQuotes.$inferInsert) {
  const db = await getDb();
  await db.insert(repairQuotes).values({ ...data, payments: (data.payments ?? []) as any });
  return data;
}

export async function updateRepairQuote(id: string, data: Partial<RepairQuote>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("payments" in normalized) normalized.payments = normalized.payments ?? [];
  await db.update(repairQuotes).set(normalized).where(eq(repairQuotes.id, id));
  return data;
}

export async function selectRepairQuote(repairId: string, quoteId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(repairQuotes).set({ selected: false }).where(eq(repairQuotes.repairId, repairId));
    await tx.update(repairQuotes).set({ selected: true }).where(eq(repairQuotes.id, quoteId));
  });
}

export async function logRepairQuotePayment(quoteId: string, payment: { date: string; amount: number; notes?: string; receipt?: string }) {
  const db = await getDb();
  const [existing] = await db.select().from(repairQuotes).where(eq(repairQuotes.id, quoteId)).limit(1);
  if (!existing) throw new Error("Quote not found");
  const payments = [...parseJsonArray(existing.payments), payment];
  await db.update(repairQuotes).set({ payments: payments as any }).where(eq(repairQuotes.id, quoteId));
  if (existing.selected) {
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0);
    await db.update(repairs).set({ cost: totalPaid }).where(eq(repairs.id, existing.repairId));
  }
}

export async function deleteRepairQuotePayment(quoteId: string, paymentIndex: number) {
  const db = await getDb();
  const [existing] = await db.select().from(repairQuotes).where(eq(repairQuotes.id, quoteId)).limit(1);
  if (!existing) throw new Error("Quote not found");
  const payments = parseJsonArray(existing.payments).filter((_: any, i: number) => i !== paymentIndex);
  await db.update(repairQuotes).set({ payments: payments as any }).where(eq(repairQuotes.id, quoteId));
  if (existing.selected) {
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0);
    await db.update(repairs).set({ cost: totalPaid }).where(eq(repairs.id, existing.repairId));
  }
}

export async function deleteRepairQuote(id: string) {
  const db = await getDb();
  await db.delete(repairQuotes).where(eq(repairQuotes.id, id));
  return true;
}
