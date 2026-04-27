import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  properties,
  expenses,
  repairs,
  upgrades,
  loans,
  wishlistItems,
  purchaseCosts,
  calendarEvents,
  type Expense,
  type Repair,
  type Upgrade,
  type Loan,
  type WishlistItem,
  type PurchaseCost,
  type CalendarEvent,
  type Property,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users);
}

export async function getProperty() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(properties).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateProperty(data: Partial<Property>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(properties).set(data).where(eq(properties.id, 1));
  return await getProperty();
}

export async function getExpenses(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(expenses.ownerId, userId)] : [];
  return await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.date));
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(expenses).values(data);
  return data;
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(expenses).set(data).where(eq(expenses.id, id));
  return data;
}

export async function deleteExpense(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(expenses).where(eq(expenses.id, id));
  return true;
}

export async function getRepairs(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(repairs.ownerId, userId)] : [];
  return await db.select().from(repairs).where(and(...conditions)).orderBy(desc(repairs.dateLogged));
}

export async function createRepair(data: typeof repairs.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(repairs).values(data);
  return data;
}

export async function updateRepair(id: string, data: Partial<Repair>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(repairs).set(data).where(eq(repairs.id, id));
  return data;
}

export async function deleteRepair(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(repairs).where(eq(repairs.id, id));
  return true;
}

export async function getUpgrades(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(upgrades.ownerId, userId)] : [];
  return await db.select().from(upgrades).where(and(...conditions)).orderBy(desc(upgrades.createdAt));
}

export async function createUpgrade(data: typeof upgrades.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(upgrades).values(data);
  return data;
}

export async function updateUpgrade(id: string, data: Partial<Upgrade>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(upgrades).set(data).where(eq(upgrades.id, id));
  return data;
}

export async function deleteUpgrade(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(upgrades).where(eq(upgrades.id, id));
  return true;
}

export async function getLoans(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(loans.ownerId, userId)] : [];
  return await db.select().from(loans).where(and(...conditions)).orderBy(desc(loans.createdAt));
}

export async function createLoan(data: typeof loans.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(loans).values(data);
  return data;
}

export async function updateLoan(id: string, data: Partial<Loan>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(loans).set(data).where(eq(loans.id, id));
  return data;
}

export async function deleteLoan(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(loans).where(eq(loans.id, id));
  return true;
}

export async function getWishlistItems(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(wishlistItems.ownerId, userId)] : [];
  return await db.select().from(wishlistItems).where(and(...conditions)).orderBy(desc(wishlistItems.createdAt));
}

export async function createWishlistItem(data: typeof wishlistItems.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(wishlistItems).values(data);
  return data;
}

export async function updateWishlistItem(id: string, data: Partial<WishlistItem>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(wishlistItems).set(data).where(eq(wishlistItems.id, id));
  return data;
}

export async function deleteWishlistItem(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(wishlistItems).where(eq(wishlistItems.id, id));
  return true;
}

export async function getPurchaseCosts(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = userId ? [eq(purchaseCosts.ownerId, userId)] : [];
  return await db.select().from(purchaseCosts).where(and(...conditions)).orderBy(desc(purchaseCosts.date));
}

export async function createPurchaseCost(data: typeof purchaseCosts.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(purchaseCosts).values(data);
  return data;
}

export async function updatePurchaseCost(id: string, data: Partial<PurchaseCost>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(purchaseCosts).set(data).where(eq(purchaseCosts.id, id));
  return data;
}

export async function deletePurchaseCost(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(purchaseCosts).where(eq(purchaseCosts.id, id));
  return true;
}

export async function getCalendarEvents(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (startDate) conditions.push(gte(calendarEvents.date, startDate));
  if (endDate) conditions.push(lte(calendarEvents.date, endDate));
  return await db.select().from(calendarEvents).where(and(...conditions)).orderBy(calendarEvents.date);
}

export async function createCalendarEvent(data: typeof calendarEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(calendarEvents).values(data);
  return data;
}

export async function updateCalendarEvent(id: string, data: Partial<CalendarEvent>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(calendarEvents).set(data).where(eq(calendarEvents.id, id));
  return data;
}

export async function deleteCalendarEvent(id: string) {
  const db = await getDb();
  if (!db) return false;
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  return true;
}

export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const allExpenses = await db.select().from(expenses).where(eq(expenses.ownerId, userId));
  const allRepairs = await db.select().from(repairs).where(eq(repairs.ownerId, userId));
  const allUpgrades = await db.select().from(upgrades).where(eq(upgrades.ownerId, userId));
  const allLoans = await db.select().from(loans).where(eq(loans.ownerId, userId));
  const allWishlist = await db.select().from(wishlistItems).where(eq(wishlistItems.ownerId, userId));
  const allPurchaseCosts = await db.select().from(purchaseCosts).where(eq(purchaseCosts.ownerId, userId));
  const prop = await getProperty();

  const today = new Date();
  const currentYear = today.getFullYear();

  const purchaseTotal = allPurchaseCosts.reduce((sum, pc) => sum + pc.amount, 0);
  const monthlyRecurring = allExpenses
    .filter((e) => e.isRecurring)
    .reduce((sum, e) => sum + e.amount, 0);
  const ytdExpenses = allExpenses
    .filter((e) => {
      const expenseDate = new Date(e.date);
      return expenseDate.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  const upgradesSpent = allUpgrades.reduce((sum, u) => sum + (u.spent || 0), 0);
  const pendingRepairs = allRepairs.filter((r) => r.status !== "Resolved").length;
  const wishlistTotal = allWishlist.reduce((sum, w) => sum + w.estimatedCost, 0);

  const totalBorrowed = allLoans.reduce((sum, l) => sum + l.totalAmount, 0);
  const totalRepaid = allLoans.reduce((sum, l) => {
    const repaymentSum = l.repayments?.reduce((s: number, r: any) => s + r.amount, 0) || 0;
    return sum + repaymentSum;
  }, 0);
  const totalOwed = totalBorrowed - totalRepaid;

  return {
    purchaseTotal,
    monthlyRecurring,
    ytdExpenses,
    upgradesSpent,
    pendingRepairs,
    wishlistTotal,
    totalInvested: purchaseTotal + upgradesSpent,
    totalBorrowed,
    totalRepaid,
    totalOwed,
    propertyName: prop?.houseName || "My Home",
    propertyAddress: prop?.address,
    propertyPrice: prop?.purchasePrice,
  };
}
