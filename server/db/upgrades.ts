import { eq, desc, and, inArray } from "drizzle-orm";
import {
  upgrades,
  upgradeOptions,
  upgradeItems,
  upgradeOptionPayments,
  type Upgrade,
  type UpgradeOption,
  type UpgradeItem,
  type UpgradeOptionPayment,
} from "../../drizzle/schema";
import { getDb } from "./client";

export type UpgradeOptionWithPayments = UpgradeOption & {
  payments: UpgradeOptionPayment[];
};

export async function getUpgrades(
  userId: number,
  propertyId: number,
  limit = 500,
  offset = 0
) {
  const db = await getDb();
  return await db
    .select()
    .from(upgrades)
    .where(
      and(eq(upgrades.ownerId, userId), eq(upgrades.propertyId, propertyId))
    )
    .orderBy(desc(upgrades.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUpgradeById(id: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(upgrades)
    .where(eq(upgrades.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function filterOwnedUpgradeIds(
  ids: string[],
  ownerId: number
): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: upgrades.id })
    .from(upgrades)
    .where(and(inArray(upgrades.id, ids), eq(upgrades.ownerId, ownerId)));
  return rows.map(r => r.id);
}

export async function createUpgrade(data: typeof upgrades.$inferInsert) {
  const db = await getDb();
  await db
    .insert(upgrades)
    .values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateUpgrade(
  id: string,
  ownerId: number,
  data: Partial<Upgrade>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(upgrades)
    .set(normalized)
    .where(and(eq(upgrades.id, id), eq(upgrades.ownerId, ownerId)));
  return data;
}

export async function deleteUpgrade(id: string, ownerId: number) {
  const db = await getDb();
  await db
    .delete(upgrades)
    .where(and(eq(upgrades.id, id), eq(upgrades.ownerId, ownerId)));
  return true;
}

// ── Upgrade Options ───────────────────────────────────────────────────────────

async function attachPayments(
  optionRows: UpgradeOption[]
): Promise<UpgradeOptionWithPayments[]> {
  if (optionRows.length === 0) return [];
  const db = await getDb();
  const ids = optionRows.map(o => o.id);
  const payRows = await db
    .select()
    .from(upgradeOptionPayments)
    .where(inArray(upgradeOptionPayments.optionId, ids))
    .orderBy(upgradeOptionPayments.date);
  const byOption: Record<string, UpgradeOptionPayment[]> = {};
  for (const p of payRows) {
    (byOption[p.optionId] ??= []).push(p);
  }
  return optionRows.map(o => ({ ...o, payments: byOption[o.id] ?? [] }));
}

export async function getUpgradeOptions(
  upgradeId: string
): Promise<UpgradeOptionWithPayments[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(upgradeOptions)
    .where(eq(upgradeOptions.upgradeId, upgradeId))
    .orderBy(upgradeOptions.createdAt);
  return attachPayments(rows);
}

export async function getUpgradeOptionCounts(upgradeIds: string[]) {
  if (upgradeIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      upgradeId: upgradeOptions.upgradeId,
      selected: upgradeOptions.selected,
    })
    .from(upgradeOptions)
    .where(inArray(upgradeOptions.upgradeId, upgradeIds));

  const map: Record<string, { total: number; hasSelected: boolean }> = {};
  for (const row of rows) {
    if (!map[row.upgradeId])
      map[row.upgradeId] = { total: 0, hasSelected: false };
    map[row.upgradeId].total++;
    if (row.selected) map[row.upgradeId].hasSelected = true;
  }
  return Object.entries(map).map(([upgradeId, c]) => ({ upgradeId, ...c }));
}

export async function getUpgradeOptionById(id: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(upgradeOptions)
    .where(eq(upgradeOptions.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function createUpgradeOption(
  data: typeof upgradeOptions.$inferInsert
) {
  const db = await getDb();
  await db.insert(upgradeOptions).values(data);
  return data;
}

export async function updateUpgradeOption(
  id: string,
  data: Partial<UpgradeOption>
) {
  const db = await getDb();
  await db.update(upgradeOptions).set(data).where(eq(upgradeOptions.id, id));
  return data;
}

export async function selectUpgradeOption(upgradeId: string, optionId: string) {
  const db = await getDb();
  await db.transaction(async tx => {
    await tx
      .update(upgradeOptions)
      .set({ selected: false })
      .where(eq(upgradeOptions.upgradeId, upgradeId));
    await tx
      .update(upgradeOptions)
      .set({ selected: true })
      .where(eq(upgradeOptions.id, optionId));
  });
}

export async function deleteUpgradeOption(id: string) {
  const db = await getDb();
  await db.delete(upgradeOptions).where(eq(upgradeOptions.id, id));
  return true;
}

// ── Upgrade option payments ───────────────────────────────────────────────────

export async function getUpgradeOptionPayments(
  optionId: string
): Promise<UpgradeOptionPayment[]> {
  const db = await getDb();
  return await db
    .select()
    .from(upgradeOptionPayments)
    .where(eq(upgradeOptionPayments.optionId, optionId))
    .orderBy(upgradeOptionPayments.date);
}

export async function createUpgradeOptionPayment(
  data: typeof upgradeOptionPayments.$inferInsert
): Promise<UpgradeOptionPayment> {
  const db = await getDb();
  await db.insert(upgradeOptionPayments).values(data);
  return data as UpgradeOptionPayment;
}

export async function deleteUpgradeOptionPayment(id: string, optionId: string) {
  const db = await getDb();
  await db
    .delete(upgradeOptionPayments)
    .where(
      and(
        eq(upgradeOptionPayments.id, id),
        eq(upgradeOptionPayments.optionId, optionId)
      )
    );
  return true;
}

// ── Upgrade Items ─────────────────────────────────────────────────────────────

export async function getUpgradeItems(upgradeId: string) {
  const db = await getDb();
  return await db
    .select()
    .from(upgradeItems)
    .where(eq(upgradeItems.upgradeId, upgradeId))
    .orderBy(upgradeItems.createdAt);
}

export async function getUpgradeItemCounts(upgradeIds: string[]) {
  if (upgradeIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      upgradeId: upgradeItems.upgradeId,
      purchased: upgradeItems.purchased,
    })
    .from(upgradeItems)
    .where(inArray(upgradeItems.upgradeId, upgradeIds));

  const map: Record<
    string,
    { total: number; done: number; needsAction: number }
  > = {};
  for (const row of rows) {
    if (!map[row.upgradeId])
      map[row.upgradeId] = { total: 0, done: 0, needsAction: 0 };
    map[row.upgradeId].total++;
    if (row.purchased) map[row.upgradeId].done++;
  }
  return Object.entries(map).map(([upgradeId, c]) => ({ upgradeId, ...c }));
}

export async function getUpgradeItemById(id: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(upgradeItems)
    .where(eq(upgradeItems.id, id))
    .limit(1);
  return result[0] ?? null;
}

export async function createUpgradeItem(
  data: typeof upgradeItems.$inferInsert
) {
  const db = await getDb();
  await db.insert(upgradeItems).values(data);
  return data;
}

export async function updateUpgradeItem(
  id: string,
  data: Partial<UpgradeItem>
) {
  const db = await getDb();
  await db.update(upgradeItems).set(data).where(eq(upgradeItems.id, id));
  return data;
}

export async function deleteUpgradeItem(id: string) {
  const db = await getDb();
  await db.delete(upgradeItems).where(eq(upgradeItems.id, id));
  return true;
}
