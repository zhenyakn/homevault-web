import { eq, desc, and } from "drizzle-orm";
import {
  inventoryItems,
  type InventoryItem,
  type InsertInventoryItem,
} from "../../drizzle/schema";
import { getDb } from "./client";

export async function getInventoryItems(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.tenantId, tenantId),
        eq(inventoryItems.propertyId, propertyId)
      )
    )
    .orderBy(desc(inventoryItems.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getInventoryItemById(id: string, tenantId?: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(inventoryItems)
    .where(
      tenantId == null
        ? eq(inventoryItems.id, id)
        : and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createInventoryItem(data: InsertInventoryItem) {
  const db = await getDb();
  await db.insert(inventoryItems).values(data);
  return data;
}

export async function updateInventoryItem(
  id: string,
  tenantId: number,
  data: Partial<InventoryItem>
) {
  const db = await getDb();
  await db
    .update(inventoryItems)
    .set(data)
    .where(
      and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId))
    );
  return data;
}

export async function deleteInventoryItem(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(inventoryItems)
    .where(
      and(eq(inventoryItems.id, id), eq(inventoryItems.tenantId, tenantId))
    );
  return true;
}
