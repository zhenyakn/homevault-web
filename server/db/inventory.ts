import { eq, desc, and } from "drizzle-orm";
import {
  inventoryItems,
  type InventoryItem,
  type InsertInventoryItem,
} from "../../drizzle/schema";
import { getDb } from "./client";

export async function getInventoryItems(
  userId: number,
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
        eq(inventoryItems.ownerId, userId),
        eq(inventoryItems.propertyId, propertyId)
      )
    )
    .orderBy(desc(inventoryItems.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getInventoryItemById(id: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
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
  ownerId: number,
  data: Partial<InventoryItem>
) {
  const db = await getDb();
  await db
    .update(inventoryItems)
    .set(data)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.ownerId, ownerId)));
  return data;
}

export async function deleteInventoryItem(id: string, ownerId: number) {
  const db = await getDb();
  await db
    .delete(inventoryItems)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.ownerId, ownerId)));
  return true;
}
