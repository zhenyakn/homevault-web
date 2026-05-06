import { eq, desc, and } from "drizzle-orm";
import { loans, type Loan } from "../../drizzle/schema";
import { getDb, parseJsonArray } from "./client";

export async function getLoans(userId: number, propertyId: number) {
  const db = await getDb();
  const rows = await db.select().from(loans)
    .where(and(eq(loans.ownerId, userId), eq(loans.propertyId, propertyId)))
    .orderBy(desc(loans.createdAt));
  return rows.map(l => ({ ...l, repayments: parseJsonArray(l.repayments) }));
}

export async function getLoanById(id: string) {
  const db = await getDb();
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  if (!result[0]) return null;
  return { ...result[0], repayments: parseJsonArray(result[0].repayments) };
}

export async function createLoan(data: typeof loans.$inferInsert) {
  const db = await getDb();
  await db.insert(loans).values({
    ...data,
    attachments: (data.attachments ?? []) as any,
    repayments: (data.repayments ?? []) as any,
  });
  return data;
}

export async function updateLoan(id: string, ownerId: number, data: Partial<Loan>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("repayments" in normalized) normalized.repayments = normalized.repayments ?? [];
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(loans).set(normalized).where(and(eq(loans.id, id), eq(loans.ownerId, ownerId)));
  return data;
}

export async function deleteLoan(id: string, ownerId: number) {
  const db = await getDb();
  await db.delete(loans).where(and(eq(loans.id, id), eq(loans.ownerId, ownerId)));
  return true;
}
