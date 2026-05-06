import { eq } from "drizzle-orm";
import { properties, type Property } from "../../drizzle/schema";
import { getDb } from "./client";

export async function getProperty(propertyId: number = 1) {
  const db = await getDb();
  const result = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPropertiesByUser(userId: number) {
  const db = await getDb();
  return await db.select().from(properties).where(eq(properties.userId, userId));
}

export async function createProperty(userId: number, data: Partial<typeof properties.$inferInsert> = {}) {
  const db = await getDb();
  const result = await db.insert(properties).values({ userId, houseName: "New Property", ...data });
  return result[0];
}

export async function updateProperty(propertyId: number, data: Partial<Property>) {
  const db = await getDb();
  await db.update(properties).set(data).where(eq(properties.id, propertyId));
  return await getProperty(propertyId);
}

export async function deleteProperty(propertyId: number) {
  const db = await getDb();
  await db.delete(properties).where(eq(properties.id, propertyId));
  return true;
}
