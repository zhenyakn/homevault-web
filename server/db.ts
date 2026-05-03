import { eq, desc, gte, lte, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  MOCK_PROPERTY_NAME, mockProperty, mockExpenses, mockRepairs,
  mockUpgrades, mockLoans, mockWishlist, mockPurchaseCosts, mockCalendarEvents,
} from "./mockData.js";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser,
  users,
  properties,
  expenses,
  repairs,
  repairQuotes,
  upgrades,
  upgradeOptions,
  upgradeItems,
  loans,
  wishlistItems,
  purchaseCosts,
  calendarEvents,
  inventoryItems,
  type Expense,
  type Repair,
  type RepairQuote,
  type Upgrade,
  type UpgradeOption,
  type UpgradeItem,
  type Loan,
  type WishlistItem,
  type PurchaseCost,
  type CalendarEvent,
  type Property,
  type InventoryItem,
  type InsertInventoryItem,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// ---------------------------------------------------------------------------
// Schema upgrade helpers — safe to re-run, ER_DUP_FIELDNAME is a no-op
// ---------------------------------------------------------------------------
async function safeAlter(pool: mysql.Pool, sql: string, label: string) {
  try {
    await pool.execute(sql);
  } catch (e: any) {
    const ignorable = [
      "ER_DUP_FIELDNAME",
      "ER_DUP_KEYNAME",
      "ER_FK_DUP_NAME",
      "ER_TABLE_EXISTS_ERROR",
    ];
    const msg: string = e?.message ?? "";
    if (
      ignorable.includes(e?.code) ||
      msg.includes("already exists") ||
      msg.includes("Duplicate") ||
      msg.includes("exists")
    ) {
      return;
    }
    console.error(`[db] schema upgrade failed (${label}):`, e?.message);
  }
}

async function runSchemaUpgrades(pool: mysql.Pool) {
  const a = (sql: string, label: string) => safeAlter(pool, sql, label);

  // ── wishlistItems ─────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "wishlistItems.name");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "wishlistItems.ownerId");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "wishlistItems.propertyId");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`category\` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "wishlistItems.category");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`estimatedPrice\` int DEFAULT NULL`, "wishlistItems.estimatedPrice");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`, "wishlistItems.priority");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`status\` enum('wanted','saved','purchased') COLLATE utf8mb4_unicode_ci DEFAULT 'wanted'`, "wishlistItems.status");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`url\` text COLLATE utf8mb4_unicode_ci`, "wishlistItems.url");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`notes\` text COLLATE utf8mb4_unicode_ci`, "wishlistItems.notes");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "wishlistItems.attachments");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`, "wishlistItems.createdAt");
  await a(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "wishlistItems.updatedAt");

  // ── expenses ──────────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "expenses.name");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "expenses.ownerId");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "expenses.propertyId");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.nextDueDate");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.recurringInterval");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "expenses.attachments");
  await a(`ALTER TABLE \`expenses\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "expenses.updatedAt");

  // ── repairs ───────────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "repairs.title");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "repairs.ownerId");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "repairs.propertyId");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`category\` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.category");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`status\` enum('open','in_progress','waiting_for_parts','waiting_for_contractor','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open'`, "repairs.status");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`priority\` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`, "repairs.priority");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`reportedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.reportedDate");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.completedDate");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`cost\` int DEFAULT NULL`, "repairs.cost");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "repairs.attachments");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`, "repairs.createdAt");
  await a(`ALTER TABLE \`repairs\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "repairs.updatedAt");

  // ── upgrades ──────────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "upgrades.title");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "upgrades.ownerId");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "upgrades.propertyId");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`category\` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.category");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`status\` enum('idea','planning','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'idea'`, "upgrades.status");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`, "upgrades.priority");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgrades.estimatedCost");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`actualCost\` int DEFAULT NULL`, "upgrades.actualCost");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.startDate");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.completedDate");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.contractor");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`roiEstimate\` int DEFAULT NULL`, "upgrades.roiEstimate");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "upgrades.attachments");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`, "upgrades.createdAt");
  await a(`ALTER TABLE \`upgrades\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "upgrades.updatedAt");

  // ── upgradeOptions ────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "upgradeOptions.title");
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci`, "upgradeOptions.description");
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgradeOptions.estimatedCost");
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`pros\` json DEFAULT NULL`, "upgradeOptions.pros");
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`cons\` json DEFAULT NULL`, "upgradeOptions.cons");
  await a(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`selected\` tinyint(1) DEFAULT '0'`, "upgradeOptions.selected");

  // ── upgradeItems ──────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`quantity\` int DEFAULT '1'`, "upgradeItems.quantity");
  await a(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.unit");
  await a(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.store");
  await a(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`purchased\` tinyint(1) DEFAULT '0'`, "upgradeItems.purchased");

  // ── loans ─────────────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "loans.name");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "loans.ownerId");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "loans.propertyId");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`originalAmount\` int NOT NULL DEFAULT 0`, "loans.originalAmount");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`currentBalance\` int NOT NULL DEFAULT 0`, "loans.currentBalance");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`monthlyPayment\` int DEFAULT NULL`, "loans.monthlyPayment");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.endDate");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`nextPaymentDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.nextPaymentDate");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`loanType\` enum('mortgage','heloc','personal','construction','other') COLLATE utf8mb4_unicode_ci DEFAULT 'mortgage'`, "loans.loanType");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "loans.attachments");
  await a(`ALTER TABLE \`loans\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "loans.updatedAt");

  // ── purchaseCosts ─────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "purchaseCosts.name");
  await a(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "purchaseCosts.ownerId");
  await a(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "purchaseCosts.propertyId");
  await a(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "purchaseCosts.attachments");
  await a(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "purchaseCosts.updatedAt");

  // ── calendarEvents ────────────────────────────────────────────────────────
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "calendarEvents.ownerId");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "calendarEvents.title");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci`, "calendarEvents.description");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.endDate");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`category\` enum('Maintenance','Payment','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.category");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`isRecurring\` tinyint(1) DEFAULT '0'`, "calendarEvents.isRecurring");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.recurringInterval");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`reminderDaysBefore\` int DEFAULT NULL`, "calendarEvents.reminderDaysBefore");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`externalCalendarId\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.externalCalendarId");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`notes\` text COLLATE utf8mb4_unicode_ci`, "calendarEvents.notes");
  await a(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "calendarEvents.updatedAt");

  // ── inventoryItems (new table — CREATE handles it, but guard columns too) ──
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`sku\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.sku");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`room\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.room");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`minQuantity\` int DEFAULT 0`, "inventoryItems.minQuantity");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.unit");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`brand\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.brand");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`warrantyExpiry\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.warrantyExpiry");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`photoUrl\` text COLLATE utf8mb4_unicode_ci`, "inventoryItems.photoUrl");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`serialNumber\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "inventoryItems.serialNumber");
  await a(`ALTER TABLE \`inventoryItems\` ADD COLUMN \`tags\` json DEFAULT NULL`, "inventoryItems.tags");
}

export async function getDb() {
  if (!_db) {
    if (!ENV.databaseUrl) {
      throw new Error(
        "[Database] DATABASE_URL is not set. " +
          "Copy .env.example to .env and fill in your MySQL connection string."
      );
    }
    try {
      _pool = mysql.createPool({
        uri: ENV.databaseUrl,
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
      });
      _db = drizzle(_pool);
      await runSchemaUpgrades(_pool);
    } catch (error) {
      throw new Error(`[Database] Failed to connect: ${error}`);
    }
  }
  return _db;
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value) ?? []; } catch { return []; }
  }
  return [];
}

/**
 * Return v as-is when it is a non-empty string/non-null value, otherwise
 * return undefined so the key is omitted from the row object entirely.
 *
 * WHY: Drizzle's mysql2 bulk-insert driver serialises an explicit `null`
 * (and even `undefined`) for ENUM / nullable-varchar columns as the empty
 * string "" in the parameterised VALUES() array.  MySQL strict mode rejects
 * "" for ENUM columns with ER_TRUNCATED_WRONG_VALUE_FOR_FIELD.
 *
 * Omitting the key from the row object causes Drizzle to skip that position
 * entirely, so MySQL falls back to the column DEFAULT (NULL), which is
 * always valid for a nullable column.
 */
function omitIfEmpty<T>(v: T): T | undefined {
  return (v === "" || v === null || v === undefined) ? undefined : v;
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

export async function getExpenseById(id: string) {
  const db = await getDb();
  const result = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createExpense(data: typeof expenses.$inferInsert) {
  const db = await getDb();
  await db.insert(expenses).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(expenses).set(normalized).where(eq(expenses.id, id));
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
    .orderBy(desc(repairs.createdAt));
}

export async function getRepairById(id: string) {
  const db = await getDb();
  const result = await db.select().from(repairs).where(eq(repairs.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createRepair(data: typeof repairs.$inferInsert) {
  const db = await getDb();
  await db.insert(repairs).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateRepair(id: string, data: Partial<Repair>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(repairs).set(normalized).where(eq(repairs.id, id));
  return data;
}

export async function deleteRepair(id: string) {
  const db = await getDb();
  await db.delete(repairs).where(eq(repairs.id, id));
  return true;
}

// ─── Repair Quotes ────────────────────────────────────────────────────────────

export async function getRepairQuotes(repairId: string) {
  const db = await getDb();
  return await db.select().from(repairQuotes).where(eq(repairQuotes.repairId, repairId)).orderBy(repairQuotes.createdAt);
}

export async function getRepairQuoteCounts(repairIds: string[]) {
  if (repairIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ repairId: repairQuotes.repairId, selected: repairQuotes.selected })
    .from(repairQuotes)
    .where(inArray(repairQuotes.repairId, repairIds));

  const map: Record<string, { total: number; hasSelected: boolean }> = {};
  for (const row of rows) {
    if (!map[row.repairId]) map[row.repairId] = { total: 0, hasSelected: false };
    map[row.repairId].total++;
    if (row.selected) map[row.repairId].hasSelected = true;
  }
  return Object.entries(map).map(([repairId, c]) => ({ repairId, ...c }));
}

export async function createRepairQuote(data: typeof repairQuotes.$inferInsert) {
  const db = await getDb();
  await db.insert(repairQuotes).values(data);
  return data;
}

export async function updateRepairQuote(id: string, data: Partial<RepairQuote>) {
  const db = await getDb();
  await db.update(repairQuotes).set(data).where(eq(repairQuotes.id, id));
  return data;
}

export async function selectRepairQuote(repairId: string, quoteId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(repairQuotes).set({ selected: false }).where(eq(repairQuotes.repairId, repairId));
    await tx.update(repairQuotes).set({ selected: true }).where(eq(repairQuotes.id, quoteId));
  });
}

export async function deleteRepairQuote(id: string) {
  const db = await getDb();
  await db.delete(repairQuotes).where(eq(repairQuotes.id, id));
  return true;
}

// ─── Upgrades ─────────────────────────────────────────────────────────────────

export async function getUpgrades(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(upgrades)
    .where(and(eq(upgrades.ownerId, userId), eq(upgrades.propertyId, propertyId)))
    .orderBy(desc(upgrades.createdAt));
}

export async function getUpgradeById(id: string) {
  const db = await getDb();
  const result = await db.select().from(upgrades).where(eq(upgrades.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createUpgrade(data: typeof upgrades.$inferInsert) {
  const db = await getDb();
  await db.insert(upgrades).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateUpgrade(id: string, data: Partial<Upgrade>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(upgrades).set(normalized).where(eq(upgrades.id, id));
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

export async function getLoanById(id: string) {
  const db = await getDb();
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createLoan(data: typeof loans.$inferInsert) {
  const db = await getDb();
  await db.insert(loans).values({
    ...data,
    attachments: (data.attachments ?? []) as any,
  });
  return data;
}

export async function updateLoan(id: string, data: Partial<Loan>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(loans).set(normalized).where(eq(loans.id, id));
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

export async function getWishlistItemById(id: string) {
  const db = await getDb();
  const result = await db.select().from(wishlistItems).where(eq(wishlistItems.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createWishlistItem(data: typeof wishlistItems.$inferInsert) {
  const db = await getDb();
  await db.insert(wishlistItems).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updateWishlistItem(id: string, data: Partial<WishlistItem>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(wishlistItems).set(normalized).where(eq(wishlistItems.id, id));
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

export async function getPurchaseCostById(id: string) {
  const db = await getDb();
  const result = await db.select().from(purchaseCosts).where(eq(purchaseCosts.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createPurchaseCost(data: typeof purchaseCosts.$inferInsert) {
  const db = await getDb();
  await db.insert(purchaseCosts).values({ ...data, attachments: (data.attachments ?? []) as any });
  return data;
}

export async function updatePurchaseCost(id: string, data: Partial<PurchaseCost>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized) normalized.attachments = normalized.attachments ?? [];
  await db.update(purchaseCosts).set(normalized).where(eq(purchaseCosts.id, id));
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
  return await db.select().from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.propertyId, propertyId),
        startDate ? gte(calendarEvents.date, startDate) : undefined,
        endDate   ? lte(calendarEvents.date, endDate)   : undefined,
      )
    )
    .orderBy(calendarEvents.date);
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

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function getInventoryItems(userId: number, propertyId: number) {
  const db = await getDb();
  return await db.select().from(inventoryItems)
    .where(and(eq(inventoryItems.ownerId, userId), eq(inventoryItems.propertyId, propertyId)))
    .orderBy(inventoryItems.name);
}

export async function getInventoryItemById(id: string) {
  const db = await getDb();
  const result = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createInventoryItem(data: InsertInventoryItem) {
  const db = await getDb();
  await db.insert(inventoryItems).values({ ...data, tags: (data.tags ?? []) as any });
  return data;
}

export async function updateInventoryItem(id: string, data: Partial<InventoryItem>) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("tags" in normalized) normalized.tags = normalized.tags ?? [];
  await db.update(inventoryItems).set(normalized).where(eq(inventoryItems.id, id));
  return data;
}

export async function deleteInventoryItem(id: string) {
  const db = await getDb();
  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  return true;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getRecentActivity(propertyId: number) {
  const db = await getDb();

  const [recentExpenses, recentRepairs, recentUpgrades] = await Promise.all([
    db
      .select({ id: expenses.id, label: expenses.name, ownerId: expenses.ownerId, createdAt: expenses.createdAt, ownerName: users.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.ownerId, users.id))
      .where(eq(expenses.propertyId, propertyId))
      .orderBy(desc(expenses.createdAt))
      .limit(5),
    db
      .select({ id: repairs.id, label: repairs.title, ownerId: repairs.ownerId, createdAt: repairs.createdAt, ownerName: users.name })
      .from(repairs)
      .leftJoin(users, eq(repairs.ownerId, users.id))
      .where(eq(repairs.propertyId, propertyId))
      .orderBy(desc(repairs.createdAt))
      .limit(5),
    db
      .select({ id: upgrades.id, label: upgrades.title, ownerId: upgrades.ownerId, createdAt: upgrades.createdAt, ownerName: users.name })
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

function calcMonthlyStats(allExpenses: Expense[], monthStart: string, monthEnd: string) {
  const thisMonthExp = allExpenses.filter(e => e.date >= monthStart && e.date <= monthEnd);
  const monthSpent = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const monthlyRecurring = allExpenses
    .filter(e => e.isRecurring && e.recurringInterval === "monthly")
    .reduce((s, e) => s + e.amount, 0);
  const monthCats: Record<string, number> = {};
  for (const e of thisMonthExp) {
    const cat = e.category ?? "Other";
    monthCats[cat] = (monthCats[cat] || 0) + e.amount;
  }
  return { monthSpent, monthlyRecurring, monthCats };
}

function getStaleRepairs(allRepairs: Repair[], staleCutoff: string) {
  return allRepairs
    .filter(r =>
      r.status !== "completed" && r.status !== "cancelled" &&
      (r.priority === "urgent" || r.priority === "high") &&
      (r.updatedAt
        ? new Date(r.updatedAt).toISOString().split("T")[0] <= staleCutoff
        : (r.reportedDate ?? "") <= staleCutoff))
    .map(r => ({ id: r.id, label: r.title, priority: r.priority, status: r.status, contractor: r.contractor }));
}

function buildLoanSummary(allLoans: Loan[]) {
  return allLoans.map(l => ({
    id: l.id,
    lender: l.lender,
    loanType: l.loanType,
    originalAmount: l.originalAmount,
    currentBalance: l.currentBalance,
    pct: l.originalAmount > 0 ? Math.round(((l.originalAmount - l.currentBalance) / l.originalAmount) * 100) : 0,
    paidOff: l.currentBalance <= 0,
    interestRate: l.interestRate,
    nextPaymentDate: l.nextPaymentDate,
    monthlyPayment: l.monthlyPayment,
  }));
}

export async function getDashboardStats(userId: number, propertyId: number) {
  const db = await getDb();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();
  const monthStart   = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const monthEnd     = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
  const staleCutoff  = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const ownerPropFilter = (col: { ownerId: any; propertyId: any }) =>
    and(eq(col.ownerId, userId), eq(col.propertyId, propertyId));

  const [
    allExpenses, allRepairs, allUpgrades, allLoans, allPurchaseCosts, prop,
  ] = await Promise.all([
    db.select().from(expenses).where(ownerPropFilter(expenses)),
    db.select().from(repairs).where(ownerPropFilter(repairs)),
    db.select().from(upgrades).where(ownerPropFilter(upgrades)),
    db.select().from(loans).where(ownerPropFilter(loans)),
    db.select().from(purchaseCosts).where(ownerPropFilter(purchaseCosts)),
    getProperty(propertyId),
  ]);

  const { monthSpent, monthlyRecurring, monthCats } = calcMonthlyStats(allExpenses, monthStart, monthEnd);
  const staleRepairs = getStaleRepairs(allRepairs, staleCutoff);

  const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const openRepairs = allRepairs
    .filter(r => r.status !== "completed" && r.status !== "cancelled")
    .sort((a, b) => (priOrder[a.priority ?? "medium"] ?? 2) - (priOrder[b.priority ?? "medium"] ?? 2))
    .slice(0, 5)
    .map(r => ({ id: r.id, label: r.title, priority: r.priority, status: r.status, contractor: r.contractor }));

  const activeIds = allUpgrades.filter(u => u.status === "in_progress").map(u => u.id);
  const activeOpts = activeIds.length > 0
    ? await db.select({ upgradeId: upgradeOptions.upgradeId, selected: upgradeOptions.selected })
        .from(upgradeOptions).where(inArray(upgradeOptions.upgradeId, activeIds))
    : [];

  const selMap: Record<string, boolean> = {};
  const hasOptsSet = new Set<string>();
  for (const o of activeOpts) {
    hasOptsSet.add(o.upgradeId);
    if (o.selected) selMap[o.upgradeId] = true;
  }

  const upgradesNeedingDecision = allUpgrades
    .filter(u => u.status === "in_progress" && hasOptsSet.has(u.id) && !selMap[u.id])
    .map(u => ({ id: u.id, label: u.title }));

  const activeUpgrades = allUpgrades
    .filter(u => u.status === "in_progress")
    .map(u => ({
      id: u.id,
      label: u.title,
      estimatedCost: u.estimatedCost,
      actualCost: u.actualCost || 0,
      phase: u.phase,
      pct: u.estimatedCost && u.estimatedCost > 0
        ? Math.round(((u.actualCost || 0) / u.estimatedCost) * 100)
        : 0,
    }));

  const loanSummary = buildLoanSummary(allLoans);

  return {
    monthSpent, monthlyRecurring,
    monthPct:       monthlyRecurring > 0 ? Math.round((monthSpent / monthlyRecurring) * 100) : 0,
    monthRemaining: Math.max(0, monthlyRecurring - monthSpent),
    monthCats,
    staleRepairs,
    upgradesNeedingDecision,
    openRepairs,
    openRepairsCount: allRepairs.filter(r => r.status !== "completed" && r.status !== "cancelled").length,
    activeUpgrades,
    loanSummary,
    currency:        prop?.currencyCode || "ILS",
    propertyName:    prop?.houseName || "My Home",
    propertyAddress: prop?.address,
  };
}

// ─── Upgrade Options ──────────────────────────────────────────────────────────

export async function getUpgradeOptions(upgradeId: string) {
  const db = await getDb();
  return await db.select().from(upgradeOptions).where(eq(upgradeOptions.upgradeId, upgradeId)).orderBy(upgradeOptions.createdAt);
}

export async function getUpgradeOptionCounts(upgradeIds: string[]) {
  if (upgradeIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ upgradeId: upgradeOptions.upgradeId, selected: upgradeOptions.selected })
    .from(upgradeOptions)
    .where(inArray(upgradeOptions.upgradeId, upgradeIds));

  const map: Record<string, { total: number; hasSelected: boolean }> = {};
  for (const row of rows) {
    if (!map[row.upgradeId]) map[row.upgradeId] = { total: 0, hasSelected: false };
    map[row.upgradeId].total++;
    if (row.selected) map[row.upgradeId].hasSelected = true;
  }
  return Object.entries(map).map(([upgradeId, c]) => ({ upgradeId, ...c }));
}

export async function createUpgradeOption(data: typeof upgradeOptions.$inferInsert) {
  const db = await getDb();
  await db.insert(upgradeOptions).values({
    ...data,
    pros: (data.pros ?? []) as any,
    cons: (data.cons ?? []) as any,
  });
  return data;
}

export async function updateUpgradeOption(id: string, data: Partial<UpgradeOption>) {
  const db = await getDb();
  await db.update(upgradeOptions).set(data).where(eq(upgradeOptions.id, id));
  return data;
}

export async function selectUpgradeOption(upgradeId: string, optionId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(upgradeOptions).set({ selected: false }).where(eq(upgradeOptions.upgradeId, upgradeId));
    await tx.update(upgradeOptions).set({ selected: true }).where(eq(upgradeOptions.id, optionId));
  });
}

export async function deleteUpgradeOption(id: string) {
  const db = await getDb();
  await db.delete(upgradeOptions).where(eq(upgradeOptions.id, id));
  return true;
}

// ─── Upgrade Items ────────────────────────────────────────────────────────────

export async function getUpgradeItems(upgradeId: string) {
  const db = await getDb();
  return await db.select().from(upgradeItems).where(eq(upgradeItems.upgradeId, upgradeId)).orderBy(upgradeItems.createdAt);
}

export async function getUpgradeItemCounts(upgradeIds: string[]) {
  if (upgradeIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ upgradeId: upgradeItems.upgradeId, purchased: upgradeItems.purchased })
    .from(upgradeItems)
    .where(inArray(upgradeItems.upgradeId, upgradeIds));

  const map: Record<string, { total: number; done: number }> = {};
  for (const row of rows) {
    if (!map[row.upgradeId]) map[row.upgradeId] = { total: 0, done: 0 };
    map[row.upgradeId].total++;
    if (row.purchased) map[row.upgradeId].done++;
  }
  return Object.entries(map).map(([upgradeId, c]) => ({ upgradeId, ...c }));
}

export async function createUpgradeItem(data: typeof upgradeItems.$inferInsert) {
  const db = await getDb();
  await db.insert(upgradeItems).values(data);
  return data;
}

export async function updateUpgradeItem(id: string, data: Partial<UpgradeItem>) {
  const db = await getDb();
  await db.update(upgradeItems).set(data).where(eq(upgradeItems.id, id));
  return data;
}

export async function deleteUpgradeItem(id: string) {
  const db = await getDb();
  await db.delete(upgradeItems).where(eq(upgradeItems.id, id));
  return true;
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
    const propFilter = (col: { ownerId: any; propertyId: any }) =>
      and(eq(col.ownerId, userId), eq(col.propertyId, pid));

    const [allExpenses, allRepairs, allLoans] = await Promise.all([
      db.select({ amount: expenses.amount, date: expenses.date }).from(expenses).where(propFilter(expenses)),
      db.select({ status: repairs.status }).from(repairs).where(propFilter(repairs)),
      db.select({ originalAmount: loans.originalAmount, currentBalance: loans.currentBalance }).from(loans).where(propFilter(loans)),
    ]);

    const monthSpent = allExpenses
      .filter(e => e.date >= monthStart && e.date <= monthEnd)
      .reduce((s, e) => s + e.amount, 0);

    const openRepairsCount = allRepairs.filter(r => r.status !== "completed" && r.status !== "cancelled").length;
    const outstandingLoanBalance = allLoans.reduce((sum, l) => sum + Math.max(0, l.currentBalance), 0);

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

// ─── Mock / Demo Seed ─────────────────────────────────────────────────────────

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

  // ── Expenses ───────────────────────────────────────────────────────────────
  // Build each row explicitly and OMIT nullable ENUM/varchar keys when the
  // value is absent. Drizzle mysql2 bulk-insert coerces an explicit null (or
  // undefined) for ENUM columns to "" in the parameterised query, which MySQL
  // strict mode rejects. Omitting the key entirely causes Drizzle to skip that
  // column, so MySQL uses the column DEFAULT (NULL).
  await db.insert(expenses).values(
    mockExpenses.map(e => {
      const raw = e as any;
      const row: any = {
        id:          nanoid(),
        ownerId:     oid,
        propertyId:  pid,
        name:        raw.name,
        amount:      raw.amount,
        date:        raw.date,
        category:    raw.category ?? null,
        isRecurring: (raw.isRecurring ? 1 : 0) as any,
        attachments: [] as any,
      };
      // Only set these keys when they carry a real value — omitting them lets
      // the column DEFAULT NULL apply, avoiding the Drizzle "" coercion bug.
      const ri = omitIfEmpty(raw.recurringInterval);
      if (ri !== undefined) row.recurringInterval = ri;
      const nd = omitIfEmpty(raw.nextDueDate);
      if (nd !== undefined) row.nextDueDate = nd;
      const nt = omitIfEmpty(raw.notes);
      if (nt !== undefined) row.notes = nt;
      return row;
    })
  );

  // ── Repairs ────────────────────────────────────────────────────────────────
  await db.insert(repairs).values(
    mockRepairs.map(r => {
      const raw = r as any;
      const row: any = {
        id:          nanoid(),
        ownerId:     oid,
        propertyId:  pid,
        title:       raw.title,
        description: raw.description ?? null,
        priority:    raw.priority ?? "medium",
        status:      raw.status ?? "open",
        cost:        raw.cost ?? null,
        attachments: [] as any,
      };
      const cat = omitIfEmpty(raw.category);
      if (cat !== undefined) row.category = cat;
      const rd = omitIfEmpty(raw.reportedDate);
      if (rd !== undefined) row.reportedDate = rd;
      const cd = omitIfEmpty(raw.completedDate);
      if (cd !== undefined) row.completedDate = cd;
      const co = omitIfEmpty(raw.contractor);
      if (co !== undefined) row.contractor = co;
      const nt = omitIfEmpty(raw.notes);
      if (nt !== undefined) row.notes = nt;
      return row;
    })
  );

  for (const u of mockUpgrades) {
    const { options, items, ...upgradeCore } = u as any;
    const upgradeId = nanoid();
    await db.insert(upgrades).values({ id: upgradeId, ...upgradeCore, ownerId: oid, propertyId: pid, attachments: [] as any });
    if (options?.length) {
      await db.insert(upgradeOptions).values(
        options.map((opt: any) => ({
          id: nanoid(),
          upgradeId,
          ...opt,
          pros: (opt.pros ?? []) as any,
          cons: (opt.cons ?? []) as any,
          selected: (opt.selected ? 1 : 0) as any,
        }))
      );
    }
    if (items?.length) {
      await db.insert(upgradeItems).values(
        items.map((item: any) => ({
          id: nanoid(),
          upgradeId,
          ...item,
          purchased: (item.purchased ? 1 : 0) as any,
        }))
      );
    }
  }

  await db.insert(loans).values(
    mockLoans.map(l => ({
      id: nanoid(),
      ...l,
      attachments: [] as any,
      ownerId: oid,
      propertyId: pid,
    }))
  );

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

  // ── Calendar Events ────────────────────────────────────────────────────────
  await db.insert(calendarEvents).values(
    mockCalendarEvents.map(e => {
      const raw = e as any;
      const row: any = {
        id:          nanoid(),
        ownerId:     oid,
        propertyId:  pid,
        title:       raw.title,
        date:        raw.date,
        category:    raw.category ?? null,
        isRecurring: (raw.isRecurring ? 1 : 0) as any,
      };
      const ri = omitIfEmpty(raw.recurringInterval);
      if (ri !== undefined) row.recurringInterval = ri;
      const nd = omitIfEmpty(raw.endDate);
      if (nd !== undefined) row.endDate = nd;
      const nt = omitIfEmpty(raw.notes);
      if (nt !== undefined) row.notes = nt;
      const desc = omitIfEmpty(raw.description);
      if (desc !== undefined) row.description = desc;
      const rdb = raw.reminderDaysBefore ?? null;
      if (rdb !== null) row.reminderDaysBefore = rdb;
      const eci = omitIfEmpty(raw.externalCalendarId);
      if (eci !== undefined) row.externalCalendarId = eci;
      return row;
    })
  );

  return propertyId;
}
