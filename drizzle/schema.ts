import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with profile information for household management.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    profileColor: varchar("profileColor", { length: 20 }).default("#4a7fa5"),
    profileInitials: varchar("profileInitials", { length: 5 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    openIdIdx: index("openId_idx").on(table.openId),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Property settings and metadata
 */
export const properties = mysqlTable("properties", {
  id: int("id").primaryKey().default(1), // Single property per household
  houseName: varchar("houseName", { length: 200 }).default("My Home"),
  houseNickname: varchar("houseNickname", { length: 200 }),
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  purchaseDate: varchar("purchaseDate", { length: 20 }),
  purchasePrice: int("purchasePrice"),
  squareMeters: int("squareMeters"),
  rooms: int("rooms"),
  yearBuilt: int("yearBuilt"),
  floor: int("floor"),
  parkingSpots: int("parkingSpots"),
  hasStorage: boolean("hasStorage").default(false),
  currency: varchar("currency", { length: 10 }).default("₪"),
  currencyCode: varchar("currencyCode", { length: 10 }).default("ILS"),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Jerusalem"),
  startOfWeek: varchar("startOfWeek", { length: 20 }).default("Sunday"),
  reminderDaysBefore: int("reminderDaysBefore").default(3),
  calendarSyncEnabled: boolean("calendarSyncEnabled").default(false),
  mapsProvider: varchar("mapsProvider", { length: 20 }).default("google"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

/**
 * Expenses with category, recurring support, and attachments
 */
export const expenses = mysqlTable(
  "expenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    amount: int("amount").notNull(), // Stored in cents
    date: varchar("date", { length: 20 }).notNull(), // YYYY-MM-DD
    category: mysqlEnum("category", [
      "Mortgage",
      "Utility",
      "Insurance",
      "Tax",
      "Maintenance",
      "Other",
    ]).notNull(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    isRecurring: boolean("isRecurring").default(false),
    recurringFrequency: mysqlEnum("recurringFrequency", [
      "Monthly",
      "Quarterly",
      "Annual",
    ]),
    isPaid: boolean("isPaid").default(false),
    paidDate: varchar("paidDate", { length: 20 }),
    attachments: json("attachments").$type<string[]>().default([]),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    dateIdx: index("expense_date_idx").on(table.date),
    ownerIdx: index("expense_owner_idx").on(table.ownerId),
    categoryIdx: index("expense_category_idx").on(table.category),
  })
);

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

/**
 * Repairs with priority, status, and contractor tracking
 */
export const repairs = mysqlTable(
  "repairs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    priority: mysqlEnum("priority", ["Low", "Medium", "High", "Critical"])
      .notNull(),
    status: mysqlEnum("status", ["Pending", "In Progress", "Resolved"])
      .notNull(),
    dateLogged: varchar("dateLogged", { length: 20 }).notNull(), // YYYY-MM-DD
    contractor: varchar("contractor", { length: 200 }),
    contractorPhone: varchar("contractorPhone", { length: 20 }),
    estimatedCost: int("estimatedCost"), // In cents
    actualCost: int("actualCost"), // In cents
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    attachments: json("attachments").$type<string[]>().default([]),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusIdx: index("repair_status_idx").on(table.status),
    priorityIdx: index("repair_priority_idx").on(table.priority),
    ownerIdx: index("repair_owner_idx").on(table.ownerId),
  })
);

export type Repair = typeof repairs.$inferSelect;
export type InsertRepair = typeof repairs.$inferInsert;

/**
 * Upgrade projects with budget tracking
 */
export const upgrades = mysqlTable(
  "upgrades",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["Planned", "In Progress", "Done"]).notNull(),
    budget: int("budget").notNull(), // In cents
    spent: int("spent").default(0), // In cents
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    attachments: json("attachments").$type<string[]>().default([]),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusIdx: index("upgrade_status_idx").on(table.status),
    ownerIdx: index("upgrade_owner_idx").on(table.ownerId),
  })
);

export type Upgrade = typeof upgrades.$inferSelect;
export type InsertUpgrade = typeof upgrades.$inferInsert;

/**
 * Family loans with repayment tracking
 */
export const loans = mysqlTable(
  "loans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lender: varchar("lender", { length: 200 }).notNull(),
    totalAmount: int("totalAmount").notNull(), // In cents
    loanType: mysqlEnum("loanType", [
      "Family",
      "Bank",
      "Friend",
      "Other",
    ]).notNull(),
    interestRate: decimal("interestRate", { precision: 5, scale: 2 }).default(
      "0"
    ),
    startDate: varchar("startDate", { length: 20 }).notNull(), // YYYY-MM-DD
    dueDate: varchar("dueDate", { length: 20 }),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    repayments: json("repayments").$type<
      Array<{ date: string; amount: number; ownerId: number }>
    >().default([]),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("loan_owner_idx").on(table.ownerId),
  })
);

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

/**
 * Wishlist items for future improvements
 */
export const wishlistItems = mysqlTable(
  "wishlistItems",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    estimatedCost: int("estimatedCost").notNull(), // In cents
    priority: mysqlEnum("priority", ["Low", "Medium", "High"]).notNull(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    priorityIdx: index("wishlist_priority_idx").on(table.priority),
    ownerIdx: index("wishlist_owner_idx").on(table.ownerId),
  })
);

export type WishlistItem = typeof wishlistItems.$inferSelect;
export type InsertWishlistItem = typeof wishlistItems.$inferInsert;

/**
 * One-time purchase costs during acquisition
 */
export const purchaseCosts = mysqlTable(
  "purchaseCosts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    amount: int("amount").notNull(), // In cents
    date: varchar("date", { length: 20 }).notNull(), // YYYY-MM-DD
    category: varchar("category", { length: 100 }),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    attachments: json("attachments").$type<string[]>().default([]),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    dateIdx: index("purchase_cost_date_idx").on(table.date),
    ownerIdx: index("purchase_cost_owner_idx").on(table.ownerId),
  })
);

export type PurchaseCost = typeof purchaseCosts.$inferSelect;
export type InsertPurchaseCost = typeof purchaseCosts.$inferInsert;

/**
 * Calendar events linked to various entities
 */
export const calendarEvents = mysqlTable(
  "calendarEvents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    date: varchar("date", { length: 20 }).notNull(), // YYYY-MM-DD
    time: varchar("time", { length: 20 }), // HH:MM
    eventType: mysqlEnum("eventType", [
      "Expense",
      "Repair",
      "Upgrade",
      "Loan",
      "Other",
    ]).notNull(),
    createdById: int("createdById")
      .notNull()
      .references(() => users.id),
    linkedEntityId: varchar("linkedEntityId", { length: 36 }),
    linkedEntityType: mysqlEnum("linkedEntityType", [
      "Expense",
      "Repair",
      "Upgrade",
      "Loan",
      "PurchaseCost",
    ]),
    synced: boolean("synced").default(false),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    dateIdx: index("calendar_date_idx").on(table.date),
    createdByIdx: index("calendar_created_by_idx").on(table.createdById),
  })
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;
