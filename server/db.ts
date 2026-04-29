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

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpenses(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(expenses)
    .where(and(eq(expenses.ownerId, userId), eq(expenses.propertyId, propertyId)))
    .orderBy(desc(expenses.date));
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

export async function getRepairs(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(repairs)
    .where(and(eq(repairs.ownerId, userId), eq(repairs.propertyId, propertyId)))
    .orderBy(desc(repairs.dateLogged));
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

export async function getUpgrades(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(upgrades)
    .where(and(eq(upgrades.ownerId, userId), eq(upgrades.propertyId, propertyId)))
    .orderBy(desc(upgrades.createdAt));
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

export async function getLoans(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(loans)
    .where(and(eq(loans.ownerId, userId), eq(loans.propertyId, propertyId)))
    .orderBy(desc(loans.createdAt));
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

export async function getWishlistItems(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(wishlistItems)
    .where(and(eq(wishlistItems.ownerId, userId), eq(wishlistItems.propertyId, propertyId)))
    .orderBy(desc(wishlistItems.createdAt));
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

export async function getPurchaseCosts(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(purchaseCosts)
    .where(and(eq(purchaseCosts.ownerId, userId), eq(purchaseCosts.propertyId, propertyId)))
    .orderBy(desc(purchaseCosts.date));
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

export async function getCalendarEvents(propertyId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  const propFilter = eq(calendarEvents.propertyId, propertyId);

  if (startDate && endDate) {
    return await db.select().from(calendarEvents)
      .where(and(propFilter, gte(calendarEvents.date, startDate), lte(calendarEvents.date, endDate)))
      .orderBy(calendarEvents.date);
  }
  if (startDate) {
    return await db.select().from(calendarEvents)
      .where(and(propFilter, gte(calendarEvents.date, startDate)))
      .orderBy(calendarEvents.date);
  }
  if (endDate) {
    return await db.select().from(calendarEvents)
      .where(and(propFilter, lte(calendarEvents.date, endDate)))
      .orderBy(calendarEvents.date);
  }
  return await db.select().from(calendarEvents).where(propFilter).orderBy(calendarEvents.date);
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

export async function getRecentActivity(propertyId: number) {
  const db = await getDb();

  const [recentExpenses, recentRepairs, recentUpgrades] = await Promise.all([
    db
      .select({ id: expenses.id, label: expenses.label, ownerId: expenses.ownerId, createdAt: expenses.createdAt, ownerName: users.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.ownerId, users.id))
      .where(eq(expenses.propertyId, propertyId))
      .orderBy(desc(expenses.createdAt))
      .limit(5),
    db
      .select({ id: repairs.id, label: repairs.label, ownerId: repairs.ownerId, createdAt: repairs.createdAt, ownerName: users.name })
      .from(repairs)
      .leftJoin(users, eq(repairs.ownerId, users.id))
      .where(eq(repairs.propertyId, propertyId))
      .orderBy(desc(repairs.createdAt))
      .limit(5),
    db
      .select({ id: upgrades.id, label: upgrades.label, ownerId: upgrades.ownerId, createdAt: upgrades.createdAt, ownerName: users.name })
      .from(upgrades)
      .leftJoin(users, eq(upgrades.ownerId, users.id))
      .where(eq(upgrades.propertyId, propertyId))
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

export async function getDashboardStats(userId: number, propertyId: number) {
  const db = await getDb();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();
  const monthStart   = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const monthEnd     = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
  const today        = now.toISOString().split("T")[0];
  const staleCutoff  = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const pf = (col: any) => and(eq(col.ownerId, userId), eq(col.propertyId, propertyId));

  const [
    allExpenses, allRepairs, allUpgrades, allLoans, allPurchaseCosts, prop,
  ] = await Promise.all([
    db.select().from(expenses).where(pf(expenses)),
    db.select().from(repairs).where(pf(repairs)),
    db.select().from(upgrades).where(pf(upgrades)),
    db.select().from(loans).where(pf(loans)),
    db.select().from(purchaseCosts).where(pf(purchaseCosts)),
    getProperty(propertyId),
  ]);

  // ── This month ─────────────────────────────────────────────────────────────
  const thisMonthExp  = allExpenses.filter(e => e.date >= monthStart && e.date <= monthEnd);
  const monthSpent    = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const monthlyRecurring = allExpenses
    .filter(e => e.isRecurring && e.recurringFrequency === "Monthly")
    .reduce((s, e) => s + e.amount, 0);
  const monthCats: Record<string, number> = {};
  for (const e of thisMonthExp) monthCats[e.category] = (monthCats[e.category] || 0) + e.amount;

  // ── Attention ───────────────────────────────────────────────────────────────
  const overdueExpenses = allExpenses
    .filter(e => e.isRecurring && !e.isPaid && e.date <= today)
    .map(e => ({ id: e.id, label: e.label, amount: e.amount, date: e.date }));

  const staleRepairs = allRepairs
    .filter(r => r.status !== "Resolved" &&
      (r.priority === "Critical" || r.priority === "High") &&
      (r.updatedAt
        ? new Date(r.updatedAt).toISOString().split("T")[0] <= staleCutoff
        : r.dateLogged <= staleCutoff))
    .map(r => ({ id: r.id, label: r.label, priority: r.priority, status: r.status, contractor: r.contractor }));

  // ── Open repairs ────────────────────────────────────────────────────────────
  const priOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const openRepairs = allRepairs
    .filter(r => r.status !== "Resolved")
    .sort((a, b) => (priOrder[a.priority] ?? 3) - (priOrder[b.priority] ?? 3))
    .slice(0, 5)
    .map(r => ({ id: r.id, label: r.label, priority: r.priority, status: r.status, contractor: r.contractor }));

  // ── Active upgrades ─────────────────────────────────────────────────────────
  const activeUpgrades = allUpgrades
    .filter(u => u.status === "In Progress")
    .map(u => ({
      id: u.id, label: u.label, budget: u.budget, spent: u.spent || 0,
      pct: u.budget > 0 ? Math.round(((u.spent || 0) / u.budget) * 100) : 0,
    }));

  // ── Loan paydown ────────────────────────────────────────────────────────────
  const loanSummary = allLoans.map(l => {
    const repaid = ((l.repayments as any[]) || []).reduce((s: number, r: any) => s + r.amount, 0);
    return {
      id: l.id, lender: l.lender, loanType: l.loanType,
      totalAmount: l.totalAmount, repaid,
      pct: l.totalAmount > 0 ? Math.round((repaid / l.totalAmount) * 100) : 0,
      paidOff: repaid >= l.totalAmount,
    };
  });

  return {
    monthSpent, monthlyRecurring,
    monthPct:       monthlyRecurring > 0 ? Math.round((monthSpent / monthlyRecurring) * 100) : 0,
    monthRemaining: Math.max(0, monthlyRecurring - monthSpent),
    monthCats,
    overdueExpenses, staleRepairs,
    openRepairs,
    openRepairsCount: allRepairs.filter(r => r.status !== "Resolved").length,
    activeUpgrades,
    loanSummary,
    currency:        prop?.currencyCode || "ILS",
    propertyName:    prop?.houseName || "My Home",
    propertyAddress: prop?.address,
  };
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getPortfolioSummary(userId: number) {
  const props = await getPropertiesByUser(userId);
  if (props.length === 0) return [];

  const db = await getDb();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  return await Promise.all(props.map(async (prop) => {
    const pid = prop.id;
    const pf = (col: any) => and(eq(col.ownerId, userId), eq(col.propertyId, pid));

    const [allExpenses, allRepairs, allLoans] = await Promise.all([
      db.select({ amount: expenses.amount, date: expenses.date }).from(expenses).where(pf(expenses)),
      db.select({ status: repairs.status }).from(repairs).where(pf(repairs)),
      db.select({ totalAmount: loans.totalAmount, repayments: loans.repayments }).from(loans).where(pf(loans)),
    ]);

    const monthSpent = allExpenses
      .filter(e => e.date >= monthStart && e.date <= monthEnd)
      .reduce((s, e) => s + e.amount, 0);

    const openRepairsCount = allRepairs.filter(r => r.status !== "Resolved").length;

    const outstandingLoanBalance = allLoans.reduce((sum, l) => {
      const repaid = ((l.repayments as any[]) || []).reduce((s: number, r: any) => s + r.amount, 0);
      return sum + Math.max(0, l.totalAmount - repaid);
    }, 0);

    return {
      id: prop.id,
      houseName: prop.houseName,
      houseNickname: prop.houseNickname,
      address: prop.address,
      propertyType: prop.propertyType,
      purchasePrice: prop.purchasePrice,
      currencyCode: prop.currencyCode || "ILS",
      monthSpent,
      openRepairsCount,
      outstandingLoanBalance,
    };
  }));
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
