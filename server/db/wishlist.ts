import { eq, desc, and } from "drizzle-orm";
import { wishlistItems, type WishlistItem } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getWishlistItems(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.tenantId, tenantId),
        eq(wishlistItems.propertyId, propertyId)
      )
    )
    .orderBy(desc(wishlistItems.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getWishlistItemById(id: string, tenantId?: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(wishlistItems)
    .where(
      tenantId == null
        ? eq(wishlistItems.id, id)
        : and(eq(wishlistItems.id, id), eq(wishlistItems.tenantId, tenantId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createWishlistItem(
  data: typeof wishlistItems.$inferInsert
) {
  const db = await getDb();
  await db
    .insert(wishlistItems)
    .values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateWishlistItem(
  id: string,
  tenantId: number,
  data: Partial<WishlistItem>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(wishlistItems)
    .set(normalized)
    .where(and(eq(wishlistItems.id, id), eq(wishlistItems.tenantId, tenantId)));
  return data;
}

export async function deleteWishlistItem(id: string, tenantId: number) {
  const db = await getDb();
  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.id, id), eq(wishlistItems.tenantId, tenantId)));
  return true;
}
