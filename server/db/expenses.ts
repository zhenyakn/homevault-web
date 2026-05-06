import { eq, desc, and } from "drizzle-orm";
import { expenses, type Expense } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getExpenses(userId: number, propertyId: number, limit = 500, offset = 0) {
  const db = await getDb();
  return await db.select().from(expenses)
    .where(and(eq(expenses.ownerId, userId), eq(expenses.propertyId, propertyId)))
    .orderBy(desc(expenses.date))
    .limit(limit)
    .offset(offset);
}

export async function getExpenseById(id: string) {
  const db = await getDb();
  const result = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  await db.insert(expenses).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateExpense(id: string, ownerId: number, data: Partial<Expense>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(expenses).set(normalized).where(and(eq(expenses.id, id), eq(expenses.ownerId, ownerId)));
  return data;
}

export async function deleteExpense(id: string, ownerId: number) {
  const db = await getDb();
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.ownerId, ownerId)));
  return true;
}
