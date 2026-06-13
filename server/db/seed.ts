import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  MOCK_PROPERTY_NAME,
  mockProperty,
  mockExpenses,
  mockRepairs,
  mockUpgrades,
  mockLoans,
  mockWishlist,
  mockPurchaseCosts,
  mockCalendarEvents,
  mockInventory,
  mockExtraProperties,
} from "../mockData.js";
import {
  properties,
  expenses,
  repairs,
  repairQuotes,
  repairQuotePayments,
  upgrades,
  upgradeOptions,
  upgradeOptionPayments,
  upgradeItems,
  loans,
  loanRepayments,
  wishlistItems,
  purchaseCosts,
  calendarEvents,
  inventoryItems,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { deleteAllFilesForOwner } from "../files";
import { logger } from "../_core/logger";

export async function deleteAllUserData(userId: number) {
  // Reap the user's storage-backend files (Drive / S3) first so the rows-
  // referencing-them in the entity tables still resolve to file IDs the
  // helper can find. Best-effort: any backend failure logs + moves on; we
  // don't want a Drive outage to block the DB wipe the user explicitly asked
  // for. The files table's own rows are soft-deleted in the same call.
  try {
    const summary = await deleteAllFilesForOwner(userId);
    logger.info({ userId, summary }, "[deleteAllUserData] reaped files");
  } catch (err) {
    logger.error(
      { userId, err: (err as Error).message },
      "[deleteAllUserData] file reap failed"
    );
  }

  const db = await getDb();
  await db.transaction(async tx => {
    const userRepairIds = (
      await tx
        .select({ id: repairs.id })
        .from(repairs)
        .where(eq(repairs.ownerId, userId))
    ).map(r => r.id);

    if (userRepairIds.length > 0) {
      await tx
        .delete(repairQuotes)
        .where(inArray(repairQuotes.repairId, userRepairIds));
    }

    const userUpgradeIds = (
      await tx
        .select({ id: upgrades.id })
        .from(upgrades)
        .where(eq(upgrades.ownerId, userId))
    ).map(u => u.id);

    if (userUpgradeIds.length > 0) {
      await tx
        .delete(upgradeOptions)
        .where(inArray(upgradeOptions.upgradeId, userUpgradeIds));
      await tx
        .delete(upgradeItems)
        .where(inArray(upgradeItems.upgradeId, userUpgradeIds));
    }

    await Promise.all([
      tx.delete(expenses).where(eq(expenses.ownerId, userId)),
      tx.delete(repairs).where(eq(repairs.ownerId, userId)),
      tx.delete(upgrades).where(eq(upgrades.ownerId, userId)),
      tx.delete(loans).where(eq(loans.ownerId, userId)),
      tx.delete(wishlistItems).where(eq(wishlistItems.ownerId, userId)),
      tx.delete(purchaseCosts).where(eq(purchaseCosts.ownerId, userId)),
      tx.delete(calendarEvents).where(eq(calendarEvents.ownerId, userId)),
      tx.delete(inventoryItems).where(eq(inventoryItems.ownerId, userId)),
    ]);
  });
  return true;
}

export async function seedMockProperty(userId: number): Promise<number> {
  const db = await getDb();

  const existing = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.userId, userId),
        eq(properties.houseName, MOCK_PROPERTY_NAME)
      )
    )
    .limit(1);

  let propertyId: number;

  if (existing.length > 0) {
    propertyId = existing[0].id;
    await db
      .update(properties)
      .set(mockProperty)
      .where(eq(properties.id, propertyId));
  } else {
    const [res] = await db
      .insert(properties)
      .values({ userId, ...mockProperty });
    propertyId = (res as any).insertId as number;
  }

  const existingRepairIds = (
    await db
      .select({ id: repairs.id })
      .from(repairs)
      .where(eq(repairs.propertyId, propertyId))
  ).map(r => r.id);

  if (existingRepairIds.length > 0) {
    await db
      .delete(repairQuotes)
      .where(inArray(repairQuotes.repairId, existingRepairIds));
  }

  const existingUpgradeIds = (
    await db
      .select({ id: upgrades.id })
      .from(upgrades)
      .where(eq(upgrades.propertyId, propertyId))
  ).map(u => u.id);

  if (existingUpgradeIds.length > 0) {
    await Promise.all([
      db
        .delete(upgradeOptions)
        .where(inArray(upgradeOptions.upgradeId, existingUpgradeIds)),
      db
        .delete(upgradeItems)
        .where(inArray(upgradeItems.upgradeId, existingUpgradeIds)),
    ]);
  }

  await Promise.all([
    db.delete(expenses).where(eq(expenses.propertyId, propertyId)),
    db.delete(repairs).where(eq(repairs.propertyId, propertyId)),
    db.delete(upgrades).where(eq(upgrades.propertyId, propertyId)),
    db.delete(loans).where(eq(loans.propertyId, propertyId)),
    db.delete(wishlistItems).where(eq(wishlistItems.propertyId, propertyId)),
    db.delete(purchaseCosts).where(eq(purchaseCosts.propertyId, propertyId)),
    db.delete(calendarEvents).where(eq(calendarEvents.propertyId, propertyId)),
    db.delete(inventoryItems).where(eq(inventoryItems.propertyId, propertyId)),
  ]);

  const oid = userId;
  const pid = propertyId;

  await db.insert(expenses).values(
    mockExpenses.map(e => ({
      id: nanoid(),
      ...e,
      ownerId: oid,
      propertyId: pid,
      attachments: [] as any,
    }))
  );

  for (const r of mockRepairs) {
    const { quotes, ...repairCore } = r as any;
    const repairId = nanoid();
    await db.insert(repairs).values({
      id: repairId,
      ...repairCore,
      ownerId: oid,
      propertyId: pid,
      attachments: [] as any,
    });
    if (quotes?.length) {
      const quoteRows = quotes.map((q: any) => {
        const { payments: _p, ...quoteCore } = q;
        return { id: nanoid(), repairId, ...quoteCore };
      });
      await db.insert(repairQuotes).values(quoteRows);
      for (let i = 0; i < quotes.length; i++) {
        const pyms: any[] = quotes[i].payments ?? [];
        if (pyms.length) {
          await db.insert(repairQuotePayments).values(
            pyms.map((p: any) => ({
              id: nanoid(),
              quoteId: quoteRows[i].id,
              ...p,
            }))
          );
        }
      }
    }
  }

  for (const u of mockUpgrades) {
    const { options, items, ...upgradeCore } = u as any;
    const upgradeId = nanoid();
    await db.insert(upgrades).values({
      id: upgradeId,
      ...upgradeCore,
      ownerId: oid,
      propertyId: pid,
      attachments: [] as any,
    });
    if (options?.length) {
      const optRows = options.map((opt: any) => {
        const { payments: _p, ...optCore } = opt;
        return { id: nanoid(), upgradeId, ...optCore };
      });
      await db.insert(upgradeOptions).values(optRows);
      for (let i = 0; i < options.length; i++) {
        const pyms: any[] = options[i].payments ?? [];
        if (pyms.length) {
          await db.insert(upgradeOptionPayments).values(
            pyms.map((p: any) => ({
              id: nanoid(),
              optionId: optRows[i].id,
              ...p,
            }))
          );
        }
      }
    }
    if (items?.length) {
      await db
        .insert(upgradeItems)
        .values(
          items.map((item: any) => ({ id: nanoid(), upgradeId, ...item }))
        );
    }
  }

  for (const l of mockLoans) {
    const { repayments, ...loanCore } = l as any;
    const loanId = nanoid();
    await db.insert(loans).values({
      id: loanId,
      ...loanCore,
      attachments: [] as any,
      ownerId: oid,
      propertyId: pid,
    });
    if (repayments?.length) {
      await db
        .insert(loanRepayments)
        .values(repayments.map((r: any) => ({ id: nanoid(), loanId, ...r })));
    }
  }

  await db.insert(wishlistItems).values(
    mockWishlist.map(w => ({
      id: nanoid(),
      ...w,
      attachments: [] as any,
      ownerId: oid,
      propertyId: pid,
    }))
  );

  await db.insert(purchaseCosts).values(
    mockPurchaseCosts.map(c => ({
      id: nanoid(),
      ...c,
      attachments: [] as any,
      ownerId: oid,
      propertyId: pid,
    }))
  );

  await db.insert(calendarEvents).values(
    mockCalendarEvents.map(e => ({
      id: nanoid(),
      ...e,
      ownerId: oid,
      propertyId: pid,
    }))
  );

  await db.insert(inventoryItems).values(
    mockInventory.map(item => ({
      id: nanoid(),
      ...item,
      ownerId: oid,
      propertyId: pid,
    }))
  );

  // Seed the extra demo properties (owned-and-rented-out, rented) so the
  // redesigned Portfolio shows all three modes. Idempotent by houseName.
  await seedExtraProperties(userId);

  return propertyId;
}

/**
 * Idempotently seed the extra demo properties (one per non-default mode). Each
 * is matched by houseName; its property row + small linked-record set are
 * replaced on every run. Best-effort: failures here never block the primary
 * seed (already returned by the caller).
 */
async function seedExtraProperties(userId: number): Promise<void> {
  const db = await getDb();

  for (const bundle of mockExtraProperties) {
    const found = await db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          eq(properties.userId, userId),
          eq(properties.houseName, bundle.property.houseName as string)
        )
      )
      .limit(1);

    let pid: number;
    if (found.length > 0) {
      pid = found[0].id;
      await db
        .update(properties)
        .set(bundle.property)
        .where(eq(properties.id, pid));
    } else {
      const [res] = await db
        .insert(properties)
        .values({ userId, ...bundle.property });
      pid = (res as any).insertId as number;
    }

    // Wipe & re-insert this property's linked records.
    await Promise.all([
      db.delete(expenses).where(eq(expenses.propertyId, pid)),
      db.delete(loans).where(eq(loans.propertyId, pid)),
      db.delete(purchaseCosts).where(eq(purchaseCosts.propertyId, pid)),
    ]);

    if (bundle.expenses?.length) {
      await db.insert(expenses).values(
        bundle.expenses.map(e => ({
          id: nanoid(),
          ...e,
          attachments: [] as any,
          ownerId: userId,
          propertyId: pid,
        }))
      );
    }
    if (bundle.loans?.length) {
      await db.insert(loans).values(
        bundle.loans.map(l => ({
          id: nanoid(),
          ...l,
          attachments: [] as any,
          ownerId: userId,
          propertyId: pid,
        }))
      );
    }
    if (bundle.purchaseCosts?.length) {
      await db.insert(purchaseCosts).values(
        bundle.purchaseCosts.map(c => ({
          id: nanoid(),
          ...c,
          attachments: [] as any,
          ownerId: userId,
          propertyId: pid,
        }))
      );
    }
  }
}
