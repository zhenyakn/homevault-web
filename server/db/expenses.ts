import { eq, desc, and } from "drizzle-orm";
import { expenses, type Expense } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getExpenses(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.tenantId, tenantId), eq(expenses.propertyId, propertyId))
    )
    .orderBy(desc(expenses.date))
    .limit(limit)
    .offset(offset);
}

// getExpenseById is also called internally (loan reconciliation) where there is
// no tenant context, so the tenant gate is optional: pass tenantId from request
// handlers to enforce isolation; omit it for trusted internal lookups.
export async function getExpenseById(id: string, tenantId?: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(expenses)
    .where(
      tenantId == null
        ? eq(expenses.id, id)
        : and(eq(expenses.id, id), eq(expenses.tenantId, tenantId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  await db
    .insert(expenses)
    .values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateExpense(
  id: string,
  tenantId: number,
  data: Partial<Expense>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(expenses)
    .set(normalized)
    .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)));
  return data;
}

export async function deleteExpense(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)));
  return true;
}
