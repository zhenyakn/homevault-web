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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("expense_property_idx").on(table.propertyId),
    ownerIdx: index("expense_owner_idx").on(table.ownerId),
    loanIdx: index("expense_loan_idx").on(table.loanId),
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("loan_property_idx").on(table.propertyId),
    ownerIdx: index("loan_owner_idx").on(table.ownerId),
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
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
  table => ({
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    propertyIdx: index("inventoryItem_property_idx").on(table.propertyId),
    ownerIdx: index("inventoryItem_owner_idx").on(table.ownerId),
    categoryIdx: index("inventoryItem_category_idx").on(table.category),
    roomIdx: index("inventoryItem_room_idx").on(table.room),
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  table => ({
    ownerIdx: index("files_owner_idx").on(table.ownerUserId),
    backendIdx: index("files_backend_idx").on(table.backend),
    propertyIdx: index("files_property_idx").on(table.propertyId),
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userIdx: index("notif_log_user_idx").on(table.userId),
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
