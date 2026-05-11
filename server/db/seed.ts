import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  MOCK_PROPERTY_NAME, mockProperty, mockExpenses, mockRepairs,
  mockUpgrades, mockLoans, mockWishlist, mockPurchaseCosts, mockCalendarEvents, mockInventory,
} from "../mockData.js";
import {
  properties, expenses, repairs, repairQuotes, repairQuotePayments,
  upgrades, upgradeOptions, upgradeOptionPayments, upgradeItems,
  loans, loanRepayments, wishlistItems, purchaseCosts, calendarEvents, inventoryItems,
} from "../../drizzle/schema";
import { getDb } from "./client";

export async function deleteAllUserData(userId: number) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const userRepairIds = (
      await tx.select({ id: repairs.id }).from(repairs).where(eq(repairs.ownerId, userId))
    ).map(r => r.id);

    if (userRepairIds.length > 0) {
      await tx.delete(repairQuotes).where(inArray(repairQuotes.repairId, userRepairIds));
    }

    const userUpgradeIds = (
      await tx.select({ id: upgrades.id }).from(upgrades).where(eq(upgrades.ownerId, userId))
    ).map(u => u.id);

    if (userUpgradeIds.length > 0) {
      await tx.delete(upgradeOptions).where(inArray(upgradeOptions.upgradeId, userUpgradeIds));
      await tx.delete(upgradeItems).where(inArray(upgradeItems.upgradeId, userUpgradeIds));
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

  const existing = await db.select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.userId, userId), eq(properties.houseName, MOCK_PROPERTY_NAME)))
    .limit(1);

  let propertyId: number;

  if (existing.length > 0) {
    propertyId = existing[0].id;
    await db.update(properties).set(mockProperty).where(eq(properties.id, propertyId));
  } else {
    const [res] = await db.insert(properties).values({ userId, ...mockProperty });
    propertyId = (res as any).insertId as number;
  }

  const existingRepairIds = (
    await db.select({ id: repairs.id }).from(repairs).where(eq(repairs.propertyId, propertyId))
  ).map(r => r.id);

  if (existingRepairIds.length > 0) {
    await db.delete(repairQuotes).where(inArray(repairQuotes.repairId, existingRepairIds));
  }

  const existingUpgradeIds = (
    await db.select({ id: upgrades.id }).from(upgrades).where(eq(upgrades.propertyId, propertyId))
  ).map(u => u.id);

  if (existingUpgradeIds.length > 0) {
    await Promise.all([
      db.delete(upgradeOptions).where(inArray(upgradeOptions.upgradeId, existingUpgradeIds)),
      db.delete(upgradeItems).where(inArray(upgradeItems.upgradeId, existingUpgradeIds)),
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
    mockExpenses.map(e => ({ id: nanoid(), ...e, ownerId: oid, propertyId: pid, attachments: [] as any }))
  );

  for (const r of mockRepairs) {
    const { quotes, ...repairCore } = r as any;
    const repairId = nanoid();
    await db.insert(repairs).values({ id: repairId, ...repairCore, ownerId: oid, propertyId: pid, attachments: [] as any });
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
            pyms.map((p: any) => ({ id: nanoid(), quoteId: quoteRows[i].id, ...p }))
          );
        }
      }
    }
  }

  for (const u of mockUpgrades) {
    const { options, items, ...upgradeCore } = u as any;
    const upgradeId = nanoid();
    await db.insert(upgrades).values({ id: upgradeId, ...upgradeCore, ownerId: oid, propertyId: pid, attachments: [] as any });
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
            pyms.map((p: any) => ({ id: nanoid(), optionId: optRows[i].id, ...p }))
          );
        }
      }
    }
    if (items?.length) {
      await db.insert(upgradeItems).values(
        items.map((item: any) => ({ id: nanoid(), upgradeId, ...item }))
      );
    }
  }

  for (const l of mockLoans) {
    const { repayments, ...loanCore } = l as any;
    const loanId = nanoid();
    await db.insert(loans).values({ id: loanId, ...loanCore, attachments: [] as any, ownerId: oid, propertyId: pid });
    if (repayments?.length) {
      await db.insert(loanRepayments).values(
        repayments.map((r: any) => ({ id: nanoid(), loanId, ...r }))
      );
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
    mockCalendarEvents.map(e => ({ id: nanoid(), ...e, ownerId: oid, propertyId: pid }))
  );

  await db.insert(inventoryItems).values(
    mockInventory.map(item => ({ id: nanoid(), ...item, ownerId: oid, propertyId: pid }))
  );

  return propertyId;
}
