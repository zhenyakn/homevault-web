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
 * Extended by the addon via the `openId` field (from Home Assistant / OAuth).
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    openIdIdx: index("openId_idx").on(table.openId),
  })
);

export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const properties = mysqlTable("properties", {
  id: int("id").primaryKey().autoincrement(),
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
  propertyType: varchar("propertyType", { length: 50 }).default("Apartment"),
  remindExpenses: boolean("remindExpenses").default(true),
  remindLoans: boolean("remindLoans").default(true),
  remindRepairs: boolean("remindRepairs").default(true),
  remindCalendar: boolean("remindCalendar").default(true),
  userId: int("userId").notNull().default(1),
});

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

export const expenses = mysqlTable(
  "expenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    amount: int("amount").notNull(),
    category: mysqlEnum("category", [
      "Maintenance",
      "Utilities",
      "Insurance",
      "Tax",
      "Management",
      "Renovation",
      "Other",
    ]),
    date: varchar("date", { length: 20 }).notNull(),
    nextDueDate: varchar("nextDueDate", { length: 20 }),
    isRecurring: boolean("isRecurring").default(false),
    recurringInterval: mysqlEnum("recurringInterval", [
      "monthly",
      "quarterly",
      "yearly",
    ]),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("expense_property_idx").on(table.propertyId),
    ownerIdx: index("expense_owner_idx").on(table.ownerId),
  })
);

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

export const repairs = mysqlTable(
  "repairs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    category: mysqlEnum("category", [
      "Plumbing",
      "Electrical",
      "HVAC",
      "Structural",
      "Appliance",
      "Cosmetic",
      "Other",
    ]),
    status: mysqlEnum("status", [
      "open",
      "in_progress",
      "waiting_for_parts",
      "waiting_for_contractor",
      "completed",
      "cancelled",
    ])
      .default("open")
      .notNull(),
    priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default(
      "medium"
    ),
    reportedDate: varchar("reportedDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    cost: int("cost"),
    contractor: varchar("contractor", { length: 200 }),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("repair_property_idx").on(table.propertyId),
    ownerIdx: index("repair_owner_idx").on(table.ownerId),
  })
);

export type Repair = typeof repairs.$inferSelect;
export type InsertRepair = typeof repairs.$inferInsert;

export const repairQuotes = mysqlTable(
  "repairQuotes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    repairId: varchar("repairId", { length: 36 })
      .notNull()
      .references(() => repairs.id),
    contractor: varchar("contractor", { length: 200 }).notNull(),
    amount: int("amount").notNull(),
    notes: text("notes"),
    date: varchar("date", { length: 20 }),
    selected: boolean("selected").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    repairIdx: index("quote_repair_idx").on(table.repairId),
  })
);

export type RepairQuote = typeof repairQuotes.$inferSelect;
export type InsertRepairQuote = typeof repairQuotes.$inferInsert;

export const upgrades = mysqlTable(
  "upgrades",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    category: mysqlEnum("category", [
      "Kitchen",
      "Bathroom",
      "Bedroom",
      "Living Room",
      "Outdoor",
      "Structural",
      "Technology",
      "Other",
    ]),
    status: mysqlEnum("status", [
      "idea",
      "planning",
      "in_progress",
      "completed",
      "cancelled",
    ])
      .default("idea")
      .notNull(),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium"),
    phase: varchar("phase", { length: 100 }),
    estimatedCost: int("estimatedCost"),
    actualCost: int("actualCost"),
    startDate: varchar("startDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    contractor: varchar("contractor", { length: 200 }),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    roiEstimate: int("roiEstimate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("upgrade_property_idx").on(table.propertyId),
    ownerIdx: index("upgrade_owner_idx").on(table.ownerId),
  })
);

export type Upgrade = typeof upgrades.$inferSelect;
export type InsertUpgrade = typeof upgrades.$inferInsert;

export const upgradeOptions = mysqlTable(
  "upgradeOptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    upgradeId: varchar("upgradeId", { length: 36 })
      .notNull()
      .references(() => upgrades.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    estimatedCost: int("estimatedCost"),
    pros: json("pros").$type<string[]>(),
    cons: json("cons").$type<string[]>(),
    selected: boolean("selected").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    upgradeIdx: index("option_upgrade_idx").on(table.upgradeId),
  })
);

export type UpgradeOption = typeof upgradeOptions.$inferSelect;
export type InsertUpgradeOption = typeof upgradeOptions.$inferInsert;

export const upgradeItems = mysqlTable(
  "upgradeItems",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    upgradeId: varchar("upgradeId", { length: 36 })
      .notNull()
      .references(() => upgrades.id),
    name: varchar("name", { length: 200 }).notNull(),
    quantity: int("quantity").default(1),
    unit: varchar("unit", { length: 50 }),
    estimatedCost: int("estimatedCost"),
    actualCost: int("actualCost"),
    store: varchar("store", { length: 200 }),
    purchased: boolean("purchased").default(false),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    upgradeIdx: index("item_upgrade_idx").on(table.upgradeId),
  })
);

export type UpgradeItem = typeof upgradeItems.$inferSelect;
export type InsertUpgradeItem = typeof upgradeItems.$inferInsert;

export const loans = mysqlTable(
  "loans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    lender: varchar("lender", { length: 200 }),
    originalAmount: int("originalAmount").notNull(),
    currentBalance: int("currentBalance").notNull(),
    interestRate: decimal("interestRate", { precision: 5, scale: 2 }),
    monthlyPayment: int("monthlyPayment"),
    startDate: varchar("startDate", { length: 20 }),
    endDate: varchar("endDate", { length: 20 }),
    nextPaymentDate: varchar("nextPaymentDate", { length: 20 }),
    loanType: mysqlEnum("loanType", [
      "mortgage",
      "heloc",
      "personal",
      "construction",
      "other",
    ]).default("mortgage"),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("loan_property_idx").on(table.propertyId),
    ownerIdx: index("loan_owner_idx").on(table.ownerId),
  })
);

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

export const wishlistItems = mysqlTable(
  "wishlistItems",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    category: mysqlEnum("category", [
      "Furniture",
      "Appliance",
      "Electronics",
      "Decor",
      "Renovation",
      "Other",
    ]),
    estimatedPrice: int("estimatedPrice"),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium"),
    status: mysqlEnum("status", ["wanted", "saved", "purchased"]).default(
      "wanted"
    ),
    url: text("url"),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("wishlist_property_idx").on(table.propertyId),
    ownerIdx: index("wishlist_owner_idx").on(table.ownerId),
  })
);

export type WishlistItem = typeof wishlistItems.$inferSelect;
export type InsertWishlistItem = typeof wishlistItems.$inferInsert;

export const purchaseCosts = mysqlTable(
  "purchaseCosts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    amount: int("amount").notNull(),
    category: mysqlEnum("category", [
      "Tax",
      "Legal",
      "Inspection",
      "Agency",
      "Renovation",
      "Moving",
      "Other",
    ]),
    date: varchar("date", { length: 20 }),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("purchaseCost_property_idx").on(table.propertyId),
    ownerIdx: index("purchaseCost_owner_idx").on(table.ownerId),
  })
);

export type PurchaseCost = typeof purchaseCosts.$inferSelect;
export type InsertPurchaseCost = typeof purchaseCosts.$inferInsert;

export const calendarEvents = mysqlTable(
  "calendarEvents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    date: varchar("date", { length: 20 }).notNull(),
    endDate: varchar("endDate", { length: 20 }),
    category: mysqlEnum("category", [
      "Maintenance",
      "Payment",
      "Inspection",
      "Renovation",
      "Legal",
      "Other",
    ]),
    isRecurring: boolean("isRecurring").default(false),
    recurringInterval: mysqlEnum("recurringInterval", [
      "monthly",
      "quarterly",
      "yearly",
    ]),
    reminderDaysBefore: int("reminderDaysBefore"),
    externalCalendarId: varchar("externalCalendarId", { length: 200 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("calendar_property_idx").on(table.propertyId),
    ownerIdx: index("calendar_owner_idx").on(table.ownerId),
  })
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

// ── Inventory ─────────────────────────────────────────────────────────────────
export const inventoryItems = mysqlTable(
  "inventoryItems",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    category: mysqlEnum("category", [
      "Appliance",
      "Furniture",
      "Electronics",
      "Consumable",
      "Tool",
      "Valuable",
      "Other",
    ]).default("Other"),
    room: varchar("room", { length: 100 }),
    quantity: int("quantity").default(1).notNull(),
    minQuantity: int("minQuantity").default(0),
    unit: varchar("unit", { length: 50 }),
    purchasePrice: int("purchasePrice"),
    purchaseDate: varchar("purchaseDate", { length: 20 }),
    brand: varchar("brand", { length: 200 }),
    store: varchar("store", { length: 200 }),
    warrantyExpiry: varchar("warrantyExpiry", { length: 20 }),
    condition: mysqlEnum("condition", ["New", "Good", "Fair", "Poor"]).default("Good"),
    notes: text("notes"),
    tags: json("tags").$type<string[]>(),
    photoUrl: text("photoUrl"),
    serialNumber: varchar("serialNumber", { length: 200 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("inventoryItem_property_idx").on(table.propertyId),
    ownerIdx: index("inventoryItem_owner_idx").on(table.ownerId),
    categoryIdx: index("inventoryItem_category_idx").on(table.category),
    roomIdx: index("inventoryItem_room_idx").on(table.room),
  })
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;
