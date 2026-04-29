import { eq, desc, gte, lte, and } from "drizzle-orm";
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
  if (!_db) {
    if (!ENV.databaseUrl) {
      throw new Error(
        "[Database] DATABASE_URL is not set. " +
          "Copy .env.example to .env and fill in your MySQL connection string."
      );
    }
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      throw new Error(`[Database] Failed to connect: ${error}`);
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  const values: InsertUser = { openId: user.openId };
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

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  return await db.select().from(users);
}

// ─── Property ─────────────────────────────────────────────────────────────────

export async function getProperty() {
  const db = await getDb();
  const result = await db.select().from(properties).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateProperty(data: Partial<Property>) {
  const db = await getDb();
  await db.update(properties).set(data).where(eq(properties.id, 1));
  return await getProperty();
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpenses(userId?: number) {
  const db = await getDb();
  const query = db.select().from(expenses);
  const filtered = userId ? query.where(eq(expenses.ownerId, userId)) : query;
  return await filtered.orderBy(desc(expenses.date));
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  await db.insert(expenses).values(data);
  return data;
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  const db = await getDb();
  await db.update(expenses).set(data).where(eq(expenses.id, id));
  return data;
}

export async function deleteExpense(id: string) {
  const db = await getDb();
  await db.delete(expenses).where(eq(expenses.id, id));
  return true;
}

// ─── Repairs ──────────────────────────────────────────────────────────────────

export async function getRepairs(userId?: number) {
  const db = await getDb();
  const query = db.select().from(repairs);
  const filtered = userId ? query.where(eq(repairs.ownerId, userId)) : query;
  return await filtered.orderBy(desc(repairs.dateLogged));
}

export async function createRepair(data: typeof repairs.$inferInsert) {
  const db = await getDb();
  await db.insert(repairs).values(data);
  return data;
}

export async function updateRepair(id: string, data: Partial<Repair>) {
  const db = await getDb();
  await db.update(repairs).set(data).where(eq(repairs.id, id));
  return data;
}

export async function deleteRepair(id: string) {
  const db = await getDb();
  await db.delete(repairs).where(eq(repairs.id, id));
  return true;
}

// ─── Upgrades ─────────────────────────────────────────────────────────────────

export async function getUpgrades(userId?: number) {
  const db = await getDb();
  const query = db.select().from(upgrades);
  const filtered = userId ? query.where(eq(upgrades.ownerId, userId)) : query;
  return await filtered.orderBy(desc(upgrades.createdAt));
}

export async function createUpgrade(data: typeof upgrades.$inferInsert) {
  const db = await getDb();
  await db.insert(upgrades).values(data);
  return data;
}

export async function updateUpgrade(id: string, data: Partial<Upgrade>) {
  const db = await getDb();
  await db.update(upgrades).set(data).where(eq(upgrades.id, id));
  return data;
}

export async function deleteUpgrade(id: string) {
  const db = await getDb();
  await db.delete(upgrades).where(eq(upgrades.id, id));
  return true;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export async function getLoans(userId?: number) {
  const db = await getDb();
  const query = db.select().from(loans);
  const filtered = userId ? query.where(eq(loans.ownerId, userId)) : query;
  return await filtered.orderBy(desc(loans.createdAt));
}

export async function createLoan(data: typeof loans.$inferInsert) {
  const db = await getDb();
  await db.insert(loans).values(data);
  return data;
}

export async function updateLoan(id: string, data: Partial<Loan>) {
  const db = await getDb();
  await db.update(loans).set(data).where(eq(loans.id, id));
  return data;
}

export async function deleteLoan(id: string) {
  const db = await getDb();
  await db.delete(loans).where(eq(loans.id, id));
  return true;
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

export async function getWishlistItems(userId?: number) {
  const db = await getDb();
  const query = db.select().from(wishlistItems);
  const filtered = userId ? query.where(eq(wishlistItems.ownerId, userId)) : query;
  return await filtered.orderBy(desc(wishlistItems.createdAt));
}

export async function createWishlistItem(data: typeof wishlistItems.$inferInsert) {
  const db = await getDb();
  await db.insert(wishlistItems).values(data);
  return data;
}

export async function updateWishlistItem(id: string, data: Partial<WishlistItem>) {
  const db = await getDb();
  await db.update(wishlistItems).set(data).where(eq(wishlistItems.id, id));
  return data;
}

export async function deleteWishlistItem(id: string) {
  const db = await getDb();
  await db.delete(wishlistItems).where(eq(wishlistItems.id, id));
  return true;
}

// ─── Purchase Costs ───────────────────────────────────────────────────────────

export async function getPurchaseCosts(userId?: number) {
  const db = await getDb();
  const query = db.select().from(purchaseCosts);
  const filtered = userId ? query.where(eq(purchaseCosts.ownerId, userId)) : query;
  return await filtered.orderBy(desc(purchaseCosts.date));
}

export async function createPurchaseCost(data: typeof purchaseCosts.$inferInsert) {
  const db = await getDb();
  await db.insert(purchaseCosts).values(data);
  return data;
}

export async function updatePurchaseCost(id: string, data: Partial<PurchaseCost>) {
  const db = await getDb();
  await db.update(purchaseCosts).set(data).where(eq(purchaseCosts.id, id));
  return data;
}

export async function deletePurchaseCost(id: string) {
  const db = await getDb();
  await db.delete(purchaseCosts).where(eq(purchaseCosts.id, id));
  return true;
}

// ─── Calendar Events ──────────────────────────────────────────────────────────

export async function getCalendarEvents(startDate?: string, endDate?: string) {
  const db = await getDb();
  const query = db.select().from(calendarEvents);

  if (startDate && endDate) {
    // Both bounds — return only events within the range (used by Calendar month view)
    return await query
      .where(and(gte(calendarEvents.date, startDate), lte(calendarEvents.date, endDate)))
      .orderBy(calendarEvents.date);
  }
  if (startDate) {
    return await query
      .where(gte(calendarEvents.date, startDate))
      .orderBy(calendarEvents.date);
  }
  if (endDate) {
    return await query
      .where(lte(calendarEvents.date, endDate))
      .orderBy(calendarEvents.date);
  }
  return await query.orderBy(calendarEvents.date);
}

export async function createCalendarEvent(data: typeof calendarEvents.$inferInsert) {
  const db = await getDb();
  await db.insert(calendarEvents).values(data);
  return data;
}

export async function updateCalendarEvent(id: string, data: Partial<CalendarEvent>) {
  const db = await getDb();
  await db.update(calendarEvents).set(data).where(eq(calendarEvents.id, id));
  return data;
}

export async function deleteCalendarEvent(id: string) {
  const db = await getDb();
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  return true;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getRecentActivity() {
  const db = await getDb();

  const [recentExpenses, recentRepairs, recentUpgrades] = await Promise.all([
    db
      .select({ id: expenses.id, label: expenses.label, ownerId: expenses.ownerId, createdAt: expenses.createdAt, ownerName: users.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.ownerId, users.id))
      .orderBy(desc(expenses.createdAt))
      .limit(5),
    db
      .select({ id: repairs.id, label: repairs.label, ownerId: repairs.ownerId, createdAt: repairs.createdAt, ownerName: users.name })
      .from(repairs)
      .leftJoin(users, eq(repairs.ownerId, users.id))
      .orderBy(desc(repairs.createdAt))
      .limit(5),
    db
      .select({ id: upgrades.id, label: upgrades.label, ownerId: upgrades.ownerId, createdAt: upgrades.createdAt, ownerName: users.name })
      .from(upgrades)
      .leftJoin(users, eq(upgrades.ownerId, users.id))
      .orderBy(desc(upgrades.createdAt))
      .limit(5),
  ]);

  const all = [
    ...recentExpenses.map((e) => ({ ...e, type: "expense" as const })),
    ...recentRepairs.map((r) => ({ ...r, type: "repair" as const })),
    ...recentUpgrades.map((u) => ({ ...u, type: "upgrade" as const })),
  ];

  all.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  return all.slice(0, 10);
}

export async function getDashboardStats(userId: number) {
  const db = await getDb();

  const [
    allExpenses,
    allRepairs,
    allUpgrades,
    allLoans,
    allWishlist,
    allPurchaseCosts,
    prop,
  ] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.ownerId, userId)),
    db.select().from(repairs).where(eq(repairs.ownerId, userId)),
    db.select().from(upgrades).where(eq(upgrades.ownerId, userId)),
    db.select().from(loans).where(eq(loans.ownerId, userId)),
    db.select().from(wishlistItems).where(eq(wishlistItems.ownerId, userId)),
    db.select().from(purchaseCosts).where(eq(purchaseCosts.ownerId, userId)),
    getProperty(),
  ]);

  const currentYear = new Date().getFullYear();

  const purchaseTotal = allPurchaseCosts.reduce((sum, pc) => sum + pc.amount, 0);
  const monthlyRecurring = allExpenses.filter((e) => e.isRecurring).reduce((sum, e) => sum + e.amount, 0);
  const ytdExpenses = allExpenses
    .filter((e) => new Date(e.date).getFullYear() === currentYear)
    .reduce((sum, e) => sum + e.amount, 0);
  const upgradesSpent = allUpgrades.reduce((sum, u) => sum + (u.spent || 0), 0);
  const pendingRepairs = allRepairs.filter((r) => r.status !== "Resolved").length;
  const wishlistTotal = allWishlist.reduce((sum, w) => sum + w.estimatedCost, 0);
  const totalBorrowed = allLoans.reduce((sum, l) => sum + l.totalAmount, 0);
  const totalRepaid = allLoans.reduce((sum, l) => {
    return sum + (l.repayments?.reduce((s: number, r: any) => s + r.amount, 0) || 0);
  }, 0);

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
    totalOwed: totalBorrowed - totalRepaid,
    propertyName: prop?.houseName || "My Home",
    propertyAddress: prop?.address,
    propertyPrice: prop?.purchasePrice,
  };
}

// ─── Data Management ──────────────────────────────────────────────────────────

export async function deleteAllUserData(userId: number) {
  const db = await getDb();
  // Delete in FK-safe order (no FKs on these tables pointing to each other)
  await Promise.all([
    db.delete(expenses).where(eq(expenses.ownerId, userId)),
    db.delete(repairs).where(eq(repairs.ownerId, userId)),
    db.delete(upgrades).where(eq(upgrades.ownerId, userId)),
    db.delete(loans).where(eq(loans.ownerId, userId)),
    db.delete(wishlistItems).where(eq(wishlistItems.ownerId, userId)),
    db.delete(purchaseCosts).where(eq(purchaseCosts.ownerId, userId)),
  ]);
  // Calendar events by createdById
  await db.delete(calendarEvents).where(eq(calendarEvents.createdById, userId));
  return true;
}
