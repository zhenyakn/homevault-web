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
  uniqueIndex,
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
    // Server-wide role for the admin console. Distinct from a user's per-tenant
    // role: a `superadmin` manages all users/tenants and global server config.
    // (The legacy `role` column was dropped after authorization moved here.)
    globalRole: mysqlEnum("globalRole", ["user", "superadmin"])
      .default("user")
      .notNull(),
    // The tenant selected at login when a user belongs to more than one. Soft
    // reference (no FK) to avoid a users<->tenants circular constraint.
    defaultTenantId: int("defaultTenantId"),
    // Notification channel destinations (email already lives above).
    telegramChatId: varchar("telegramChatId", { length: 64 }),
    whatsappPhone: varchar("whatsappPhone", { length: 32 }),
    // Preferred UI language; also drives the language of outbound notifications.
    language: varchar("language", { length: 8 }).default("en"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({
    openIdIdx: index("openId_idx").on(table.openId),
  })
);

export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const properties = mysqlTable(
  "properties",
  {
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
    // Number of floors the dwelling itself has (houses/villas/townhouses), as
    // opposed to `floor` which is the storey an apartment sits on.
    floors: int("floors"),
    // Garden / yard size in m² — relevant for ground-level dwellings.
    gardenSize: int("gardenSize"),
    parkingSpots: int("parkingSpots"),
    hasStorage: boolean("hasStorage").default(false),
    // Building has an elevator — relevant for apartments / penthouses / studios.
    hasElevator: boolean("hasElevator").default(false),
    // Has a protected space / safe room (ממ״ד) — relevant across dwelling types.
    hasShelter: boolean("hasShelter").default(false),
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
    // How the user holds this property. Drives which financial fields and
    // reminders apply: owned_rented = bought & rented out (landlord),
    // owned_personal = bought, owner-occupied, not rented, rented = the user is
    // the tenant. Defaults so every pre-existing row stays valid.
    propertyMode: mysqlEnum("propertyMode", [
      "owned_rented",
      "owned_personal",
      "rented",
    ]).default("owned_personal"),
    // Rental terms. For `rented` these describe the lease the user pays; for
    // `owned_rented` `monthlyRent` is the (informational) income received. All
    // nullable — only populated for rental modes.
    monthlyRent: int("monthlyRent"),
    leaseStart: varchar("leaseStart", { length: 20 }),
    leaseEnd: varchar("leaseEnd", { length: 20 }),
    deposit: int("deposit"),
    landlord: varchar("landlord", { length: 200 }),
    userId: int("userId").notNull().default(1),
    // Owning tenant — the multi-tenant isolation boundary. Stays nullable: the
    // add-on seeds a placeholder property (id=1) before any user/tenant exists,
    // so a NULL here is legitimate for standalone installs. New properties are
    // always created with a tenant. Soft reference (no FK).
    tenantId: int("tenantId"),
  },
  table => ({
    tenantIdx: index("property_tenant_idx").on(table.tenantId),
    userIdx: index("property_user_idx").on(table.userId),
  })
);

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
      "Loan",
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
    isPaid: boolean("isPaid").default(false),
    paidDate: varchar("paidDate", { length: 20 }),
    // Optional link to a loan: when a "Loan" category expense is paid, it feeds
    // a matching loanRepayment and decrements the loan's currentBalance.
    loanId: varchar("loanId", { length: 36 }),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("expense_property_idx").on(table.propertyId),
    ownerIdx: index("expense_owner_idx").on(table.ownerId),
    loanIdx: index("expense_loan_idx").on(table.loanId),
    tenantIdx: index("expense_tenant_idx").on(table.tenantId),
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
    priority: mysqlEnum("priority", [
      "low",
      "medium",
      "high",
      "urgent",
    ]).default("medium"),
    reportedDate: varchar("reportedDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    cost: int("cost"),
    contractor: varchar("contractor", { length: 200 }),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("repair_property_idx").on(table.propertyId),
    ownerIdx: index("repair_owner_idx").on(table.ownerId),
    tenantIdx: index("repair_tenant_idx").on(table.tenantId),
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
  table => ({
    repairIdx: index("quote_repair_idx").on(table.repairId),
  })
);

export type RepairQuote = typeof repairQuotes.$inferSelect;
export type InsertRepairQuote = typeof repairQuotes.$inferInsert;

export const repairQuotePayments = mysqlTable(
  "repairQuotePayments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    quoteId: varchar("quoteId", { length: 36 })
      .notNull()
      .references(() => repairQuotes.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    notes: text("notes"),
    receipt: text("receipt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    quoteIdx: index("rqpay_quote_idx").on(table.quoteId),
  })
);

export type RepairQuotePayment = typeof repairQuotePayments.$inferSelect;
export type InsertRepairQuotePayment = typeof repairQuotePayments.$inferInsert;

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
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default(
      "medium"
    ),
    estimatedCost: int("estimatedCost"),
    actualCost: int("actualCost"),
    startDate: varchar("startDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    contractor: varchar("contractor", { length: 200 }),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    roiEstimate: int("roiEstimate"),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("upgrade_property_idx").on(table.propertyId),
    ownerIdx: index("upgrade_owner_idx").on(table.ownerId),
    tenantIdx: index("upgrade_tenant_idx").on(table.tenantId),
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
  table => ({
    upgradeIdx: index("option_upgrade_idx").on(table.upgradeId),
  })
);

export type UpgradeOption = typeof upgradeOptions.$inferSelect;
export type InsertUpgradeOption = typeof upgradeOptions.$inferInsert;

export const upgradeOptionPayments = mysqlTable(
  "upgradeOptionPayments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    optionId: varchar("optionId", { length: 36 })
      .notNull()
      .references(() => upgradeOptions.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    notes: text("notes"),
    receipt: text("receipt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    optionIdx: index("uopay_option_idx").on(table.optionId),
  })
);

export type UpgradeOptionPayment = typeof upgradeOptionPayments.$inferSelect;
export type InsertUpgradeOptionPayment =
  typeof upgradeOptionPayments.$inferInsert;

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
  table => ({
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
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("loan_property_idx").on(table.propertyId),
    ownerIdx: index("loan_owner_idx").on(table.ownerId),
    tenantIdx: index("loan_tenant_idx").on(table.tenantId),
  })
);

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

export const loanRepayments = mysqlTable(
  "loanRepayments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    loanId: varchar("loanId", { length: 36 })
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    notes: text("notes"),
    // When set, this repayment was auto-generated from a paid "Loan" expense and
    // is kept in sync with it (reconcileExpenseRepayment). Null = manual entry.
    sourceExpenseId: varchar("sourceExpenseId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    loanIdx: index("lrep_loan_idx").on(table.loanId),
    sourceExpenseIdx: index("lrep_source_expense_idx").on(
      table.sourceExpenseId
    ),
  })
);

export type LoanRepayment = typeof loanRepayments.$inferSelect;
export type InsertLoanRepayment = typeof loanRepayments.$inferInsert;

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
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default(
      "medium"
    ),
    status: mysqlEnum("status", ["wanted", "saved", "purchased"]).default(
      "wanted"
    ),
    url: text("url"),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("wishlist_property_idx").on(table.propertyId),
    ownerIdx: index("wishlist_owner_idx").on(table.ownerId),
    tenantIdx: index("wishlist_tenant_idx").on(table.tenantId),
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
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("purchaseCost_property_idx").on(table.propertyId),
    ownerIdx: index("purchaseCost_owner_idx").on(table.ownerId),
    tenantIdx: index("purchaseCost_tenant_idx").on(table.tenantId),
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
      "Loan",
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
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("calendar_property_idx").on(table.propertyId),
    ownerIdx: index("calendar_owner_idx").on(table.ownerId),
    tenantIdx: index("calendar_tenant_idx").on(table.tenantId),
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
    condition: mysqlEnum("condition", ["New", "Good", "Fair", "Poor"]).default(
      "Good"
    ),
    // Whether the item conveys with the property (fixture) or belongs to the
    // owner personally — used to scope the property valuation.
    assetType: mysqlEnum("assetType", ["fixture", "personal"]).default(
      "fixture"
    ),
    notes: text("notes"),
    tags: json("tags").$type<string[]>(),
    photoUrl: text("photoUrl"),
    serialNumber: varchar("serialNumber", { length: 200 }),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("inventoryItem_property_idx").on(table.propertyId),
    ownerIdx: index("inventoryItem_owner_idx").on(table.ownerId),
    categoryIdx: index("inventoryItem_category_idx").on(table.category),
    roomIdx: index("inventoryItem_room_idx").on(table.room),
    tenantIdx: index("inventoryItem_tenant_idx").on(table.tenantId),
  })
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

// ── App settings (single key/value store) ─────────────────────────────────────
// Used to persist secrets that should not live in env vars (e.g. the Google
// Drive OAuth refresh token) plus cached lookups such as the per-user Drive
// folder IDs.
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ── Files registry ────────────────────────────────────────────────────────────
// Every upload — whether persisted on S3 or on Google Drive — gets a row here.
// The `attachments` JSON columns on expenses/repairs/upgrades/loans/wishlist/
// purchaseCosts store *proxy URLs* of the shape `/api/files/<id>/<name>`; the
// server resolves the row, checks ownership, and streams / 302-redirects the
// content according to `backend`.
export const files = mysqlTable(
  "files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    // Discriminator string; matches the `name` field on StorageBackend.
    // Kept as varchar (not mysqlEnum) so adding a third backend in future
    // doesn't require an enum migration.
    backend: varchar("backend", { length: 16 }).notNull(),
    // Backend-specific identifier: S3 key or Google Drive fileId.
    externalId: text("externalId").notNull(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 150 }).notNull(),
    size: int("size").default(0).notNull(),
    ownerUserId: int("ownerUserId")
      .notNull()
      .references(() => users.id),
    // NULL for files uploaded before per-property layout existed. Set on every
    // new upload so the file-browser UI + property-delete reaper can scope by
    // property cheaply (also lets `HomeVault/property-<id>/<userId>/` Drive
    // folders mirror this).
    propertyId: int("propertyId"),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    // Owning tenant — nullable: files stay owner-scoped until Stage 2 per-tenant
    // storage. Backfilled for existing rows; new uploads don't set it yet.
    tenantId: int("tenantId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  table => ({
    ownerIdx: index("files_owner_idx").on(table.ownerUserId),
    backendIdx: index("files_backend_idx").on(table.backend),
    propertyIdx: index("files_property_idx").on(table.propertyId),
    tenantIdx: index("files_tenant_idx").on(table.tenantId),
  })
);

export type FileRecord = typeof files.$inferSelect;
export type InsertFileRecord = typeof files.$inferInsert;

// ── Notifications ─────────────────────────────────────────────────────────────

/** Per-user, per-channel opt-in. The *what to send* flags live on `properties`
 *  (remindExpenses/Loans/Repairs/Calendar); this table is *which channels*. */
export const notificationPrefs = mysqlTable(
  "notification_prefs",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    channel: mysqlEnum("channel", [
      "inapp",
      "push",
      "email",
      "webpush",
      "telegram",
      "whatsapp",
    ]).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userChannelIdx: index("notif_prefs_user_channel_idx").on(
      table.userId,
      table.channel
    ),
  })
);

export type NotificationPref = typeof notificationPrefs.$inferSelect;
export type InsertNotificationPref = typeof notificationPrefs.$inferInsert;

/** Delivery history + idempotency + the in-app notification center feed.
 *  The unique (userId, dedupeKey, channel) index is the idempotency guard: the
 *  daily sweep can run repeatedly without re-sending the same reminder. */
export const notificationLog = mysqlTable(
  "notification_log",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    // The property this notification belongs to. Reminders (expense/loan/etc.)
    // are property-specific and only surface while that property is active;
    // system notifications (e.g. test sends) leave this null and show globally.
    propertyId: int("propertyId").references(() => properties.id),
    channel: mysqlEnum("channel", [
      "inapp",
      "push",
      "email",
      "webpush",
      "telegram",
      "whatsapp",
    ]).notNull(),
    category: mysqlEnum("category", [
      "expense",
      "loan",
      "repair",
      "warranty",
      "calendar",
      "system",
    ]).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").notNull(),
    url: varchar("url", { length: 500 }),
    dedupeKey: varchar("dedupeKey", { length: 200 }).notNull(),
    status: mysqlEnum("status", ["sent", "failed", "skipped"]).notNull(),
    reason: varchar("reason", { length: 300 }),
    readAt: timestamp("readAt"),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    // Owning tenant — nullable: notification writes don't stamp it yet
    // (backfilled for existing rows).
    tenantId: int("tenantId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("notif_log_user_idx").on(table.userId),
    tenantIdx: index("notif_log_tenant_idx").on(table.tenantId),
    // Feed reads filter on (user, property); index the pair to keep them fast.
    propertyIdx: index("notif_log_property_idx").on(
      table.userId,
      table.propertyId
    ),
    // Idempotency: one row per (user, logical event, channel).
    dedupeIdx: index("notif_log_dedupe_idx").on(
      table.userId,
      table.dedupeKey,
      table.channel
    ),
  })
);

export type NotificationLogRow = typeof notificationLog.$inferSelect;
export type InsertNotificationLogRow = typeof notificationLog.$inferInsert;

/** Browser Web Push subscriptions (one device/browser per row). */
export const webPushSubscriptions = mysqlTable(
  "web_push_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("web_push_user_idx").on(table.userId),
  })
);

export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type InsertWebPushSubscription =
  typeof webPushSubscriptions.$inferInsert;

/** Short-lived codes used to link a Telegram chat to a HomeVault account. */
export const botLinkCodes = mysqlTable(
  "bot_link_codes",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    code: varchar("code", { length: 32 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    codeIdx: index("bot_link_code_idx").on(table.code),
  })
);

export type BotLinkCode = typeof botLinkCodes.$inferSelect;
export type InsertBotLinkCode = typeof botLinkCodes.$inferInsert;

// ─── Apartment Search (hunting mode) ──────────────────────────────────────────
// A standalone workspace for tracking the apartment-picking process — before a
// place is actually owned or rented. Unlike every other entity, these rows are
// scoped to the user account directly (userId), NOT to an active propertyId: a
// candidate isn't a property yet. When the user "picks" a winning candidate it
// can be converted into a real `properties` row via the property wizard, and
// `apartmentCandidates.convertedPropertyId` records the link.

/** A search project, e.g. "2BR rental near the office". Drives rent-vs-buy. */
export const apartmentSearches = mysqlTable(
  "apartmentSearches",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    // Drives which money fields apply: 'rent' → monthly rent + deposit,
    // 'buy' → asking price.
    searchType: mysqlEnum("searchType", ["rent", "buy"]).notNull(),
    // Max monthly rent (rent) or max purchase price (buy), in minor units.
    targetBudget: int("targetBudget"),
    currencyCode: varchar("currencyCode", { length: 10 }).default("ILS"),
    status: mysqlEnum("status", ["active", "completed", "archived"]).default(
      "active"
    ),
    notes: text("notes"),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdx: index("aptsearch_user_idx").on(table.userId),
    tenantIdx: index("aptsearch_tenant_idx").on(table.tenantId),
  })
);

export type ApartmentSearch = typeof apartmentSearches.$inferSelect;
export type InsertApartmentSearch = typeof apartmentSearches.$inferInsert;

/** A candidate listing being evaluated within a search. */
export const apartmentCandidates = mysqlTable(
  "apartmentCandidates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    searchId: varchar("searchId", { length: 36 })
      .notNull()
      .references(() => apartmentSearches.id, { onDelete: "cascade" }),
    // Denormalised owner so candidate queries can scope by user without a join.
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    address: text("address"),
    latitude: decimal("latitude", { precision: 10, scale: 8 }),
    longitude: decimal("longitude", { precision: 11, scale: 8 }),
    listingUrl: text("listingUrl"),
    // Monthly rent (rent searches) OR asking price (buy searches), minor units.
    price: int("price"),
    deposit: int("deposit"),
    // Technical details — mirror the `properties` table so a candidate can be
    // converted into a real property without losing information. Which of these
    // are relevant is driven by `propertyType` (see client/src/lib/propertySpecs).
    propertyType: varchar("propertyType", { length: 50 }).default("Apartment"),
    squareMeters: int("squareMeters"),
    rooms: int("rooms"),
    floor: int("floor"),
    // Number of floors the dwelling itself has (houses/villas/townhouses).
    floors: int("floors"),
    // Garden / yard size in m² — relevant for ground-level dwellings.
    gardenSize: int("gardenSize"),
    yearBuilt: int("yearBuilt"),
    parkingSpots: int("parkingSpots"),
    hasElevator: boolean("hasElevator").default(false),
    hasStorage: boolean("hasStorage").default(false),
    hasShelter: boolean("hasShelter").default(false),
    availableDate: varchar("availableDate", { length: 20 }),
    agentName: varchar("agentName", { length: 200 }),
    agentContact: varchar("agentContact", { length: 200 }),
    // Subjective numeric score, 1–10.
    rating: int("rating"),
    // Pipeline stage. `accepted`/`rejected` are terminal decisions.
    stage: mysqlEnum("stage", [
      "saved",
      "viewing_scheduled",
      "viewed",
      "applied",
      "accepted",
      "rejected",
    ])
      .default("saved")
      .notNull(),
    pros: json("pros").$type<string[]>(),
    cons: json("cons").$type<string[]>(),
    notes: text("notes"),
    attachments: json("attachments").$type<string[]>(),
    isFavorite: boolean("isFavorite").default(false),
    // Set once the candidate is converted into a tracked property.
    convertedPropertyId: int("convertedPropertyId").references(
      () => properties.id
    ),
    // Owning tenant (multi-tenant isolation). Nullable during Stage-1 backfill.
    tenantId: int("tenantId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    searchIdx: index("aptcand_search_idx").on(table.searchId),
    userIdx: index("aptcand_user_idx").on(table.userId),
    tenantIdx: index("aptcand_tenant_idx").on(table.tenantId),
  })
);

export type ApartmentCandidate = typeof apartmentCandidates.$inferSelect;
export type InsertApartmentCandidate = typeof apartmentCandidates.$inferInsert;

// ─── User management & multi-tenancy (Stage 1) ────────────────────────────────
// A `tenant` is the unit of data ownership and isolation: properties (and all
// their child records) belong to a tenant, and users access them via a
// `tenant_members` row that grants a per-tenant role. A user can belong to
// multiple tenants. `ownerId`/`userId` on existing tables are retained for
// attribution ("created by"), NOT for access control — that moves to `tenantId`.

/** The isolation boundary. Owns properties and all property-scoped data. */
export const tenants = mysqlTable(
  "tenants",
  {
    id: int("id").primaryKey().autoincrement(),
    name: varchar("name", { length: 200 }).notNull(),
    // Optional URL-friendly handle, used later for SAAS routing / join codes.
    slug: varchar("slug", { length: 64 }),
    status: mysqlEnum("status", ["active", "suspended"])
      .default("active")
      .notNull(),
    // The user who created the tenant. Soft reference (no FK) to avoid a
    // users<->tenants circular constraint.
    createdByUserId: int("createdByUserId"),
    // Per-tenant quotas for SAAS plans. NULL = unlimited (the standalone /
    // un-metered default). Enforced centrally at the create/join paths.
    maxProperties: int("maxProperties"),
    maxMembers: int("maxMembers"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    slugIdx: uniqueIndex("tenant_slug_idx").on(table.slug),
    createdByIdx: index("tenant_created_by_idx").on(table.createdByUserId),
  })
);

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/** Membership of a user in a tenant, with the role that governs access. */
export const tenantMembers = mysqlTable(
  "tenant_members",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    // owner: full control incl. delete tenant / transfer; admin: manage members
    // & settings; member: read/write data; viewer: read-only.
    role: mysqlEnum("role", ["owner", "admin", "member", "viewer"])
      .default("member")
      .notNull(),
    status: mysqlEnum("status", ["active", "invited", "removed"])
      .default("active")
      .notNull(),
    invitedByUserId: int("invitedByUserId"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    // One membership row per (tenant, user).
    tenantUserIdx: uniqueIndex("tenant_member_unique_idx").on(
      table.tenantId,
      table.userId
    ),
    userIdx: index("tenant_member_user_idx").on(table.userId),
    tenantIdx: index("tenant_member_tenant_idx").on(table.tenantId),
  })
);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type InsertTenantMember = typeof tenantMembers.$inferInsert;

/** Pending email invitations to join a tenant. Token is stored hashed. */
export const tenantInvites = mysqlTable(
  "tenant_invites",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenantId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", ["admin", "member", "viewer"])
      .default("member")
      .notNull(),
    // SHA-256 of the invite token; the raw token only ever lives in the link.
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    invitedByUserId: int("invitedByUserId"),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tokenIdx: uniqueIndex("tenant_invite_token_idx").on(table.tokenHash),
    tenantIdx: index("tenant_invite_tenant_idx").on(table.tenantId),
    emailIdx: index("tenant_invite_email_idx").on(table.email),
  })
);

export type TenantInvite = typeof tenantInvites.$inferSelect;
export type InsertTenantInvite = typeof tenantInvites.$inferInsert;

/** One billing subscription per tenant. The plan catalog itself lives in code
 *  (server/billing/plans.ts); this row records which plan a tenant is on plus
 *  the provider linkage so webhooks can reconcile status → tenants.status. */
export const tenantSubscriptions = mysqlTable(
  "tenant_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenantId").notNull().unique(),
    planId: varchar("planId", { length: 64 }).notNull(),
    status: mysqlEnum("status", [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "incomplete",
    ])
      .default("active")
      .notNull(),
    // Provider linkage (null for the stub / admin-assigned plans).
    provider: varchar("provider", { length: 32 }),
    providerCustomerId: varchar("providerCustomerId", { length: 128 }),
    providerSubscriptionId: varchar("providerSubscriptionId", { length: 128 }),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tenantIdx: uniqueIndex("tenant_sub_tenant_idx").on(table.tenantId),
  })
);

export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;
export type InsertTenantSubscription =
  typeof tenantSubscriptions.$inferInsert;

/** Admin-managed subscription plans. The capability *keys* are code-defined
 *  (server/billing/capabilities.ts); a plan stores which of them it includes
 *  plus its limits, price, and an optional checkout/payment-link URL that the
 *  tenant "Upgrade" button redirects to. Seeded with sane defaults by the boot
 *  migration; fully editable from the admin console. */
export const plans = mysqlTable(
  "plans",
  {
    id: int("id").primaryKey().autoincrement(),
    // Stable key referenced by tenant_subscriptions.planId.
    key: varchar("key", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    isPaid: boolean("isPaid").default(false).notNull(),
    priceCents: int("priceCents").default(0).notNull(),
    currency: varchar("currency", { length: 3 }).default("ils").notNull(),
    interval: mysqlEnum("interval", ["month", "year", "none"])
      .default("none")
      .notNull(),
    // NULL = unlimited.
    maxProperties: int("maxProperties"),
    maxMembers: int("maxMembers"),
    // Enabled capability keys (subset of the code registry).
    capabilities: json("capabilities").$type<string[]>(),
    // Payment-link the "Upgrade" button forwards to (paid plans).
    checkoutUrl: varchar("checkoutUrl", { length: 1024 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    keyIdx: uniqueIndex("plan_key_idx").on(table.key),
  })
);

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

/** Native email/password identities (SAAS self-signup). OAuth/NO_AUTH users
 *  have no row here — their identity lives entirely on `users.openId`. */
export const userCredentials = mysqlTable(
  "user_credentials",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId").notNull().unique(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    // argon2id / bcrypt hash — never the raw password.
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    emailVerifiedAt: timestamp("emailVerifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    emailIdx: index("user_cred_email_idx").on(table.email),
  })
);

export type UserCredential = typeof userCredentials.$inferSelect;
export type InsertUserCredential = typeof userCredentials.$inferInsert;

/** Short-lived, single-use tokens for email verification & password reset.
 *  Stored hashed; the raw token only travels in the emailed link. */
export const emailTokens = mysqlTable(
  "email_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("userId").notNull(),
    type: mysqlEnum("type", ["verify_email", "reset_password"]).notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tokenIdx: index("email_token_token_idx").on(table.tokenHash),
    userTypeIdx: index("email_token_user_type_idx").on(
      table.userId,
      table.type
    ),
  })
);

export type EmailToken = typeof emailTokens.$inferSelect;
export type InsertEmailToken = typeof emailTokens.$inferInsert;

/** Append-only audit trail for security-relevant actions (member changes,
 *  invites, password resets, tenant suspension, global config changes). */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").primaryKey().autoincrement(),
    actorUserId: int("actorUserId"),
    // Nullable: server-wide actions (admin console) have no tenant.
    tenantId: int("tenantId"),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("targetType", { length: 64 }),
    targetId: varchar("targetId", { length: 64 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    actorIdx: index("audit_actor_idx").on(table.actorUserId),
    tenantIdx: index("audit_tenant_idx").on(table.tenantId),
    createdIdx: index("audit_created_idx").on(table.createdAt),
  })
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type InsertAuditLogRow = typeof auditLog.$inferInsert;
