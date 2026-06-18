import { eq, desc, and } from "drizzle-orm";
import { purchaseCosts, type PurchaseCost } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getPurchaseCosts(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(purchaseCosts)
    .where(
      and(
        eq(purchaseCosts.tenantId, tenantId),
        eq(purchaseCosts.propertyId, propertyId)
      )
    )
    .orderBy(desc(purchaseCosts.date))
    .limit(limit)
    .offset(offset);
}

export async function getPurchaseCostById(id: string, tenantId?: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(purchaseCosts)
    .where(
      tenantId == null
        ? eq(purchaseCosts.id, id)
        : and(eq(purchaseCosts.id, id), eq(purchaseCosts.tenantId, tenantId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createPurchaseCost(
  data: typeof purchaseCosts.$inferInsert
) {
  const db = await getDb();
  await db
    .insert(purchaseCosts)
    .values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updatePurchaseCost(
  id: string,
  tenantId: number,
  data: Partial<PurchaseCost>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(purchaseCosts)
    .set(normalized)
    .where(and(eq(purchaseCosts.id, id), eq(purchaseCosts.tenantId, tenantId)));
  return data;
}

export async function deletePurchaseCost(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(purchaseCosts)
    .where(and(eq(purchaseCosts.id, id), eq(purchaseCosts.tenantId, tenantId)));
  return true;
}
