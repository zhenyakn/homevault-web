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
 * Extended by open-id login: openId is the stable identifier from the HA OAuth provider.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).notNull().default("user"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    openIdIdx: index("openId_idx").on(table.openId),
  })
);

/** A single real-estate property owned/managed by a user. */
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
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

/** Recurring or one-off household expenses. */
export const expenses = mysqlTable(
  "expenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    amount: int("amount").notNull(), // stored in smallest currency unit (agorot)
    date: varchar("date", { length: 20 }).notNull(),
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
    attachments: json("attachments").$type<string[]>(),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    dateIdx: index("expense_date_idx").on(table.date),
    ownerIdx: index("expense_owner_idx").on(table.ownerId),
    categoryIdx: index("expense_category_idx").on(table.category),
  })
);

/** Home loans (mortgage, personal, family). */
export const loans = mysqlTable(
  "loans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    lender: varchar("lender", { length: 200 }).notNull(),
    totalAmount: int("totalAmount").notNull(),
    loanType: mysqlEnum("loanType", ["Family", "Bank", "Friend", "Other"]).notNull(),
    interestRate: decimal("interestRate", { precision: 5, scale: 2 }).default("0.00"),
    startDate: varchar("startDate", { length: 20 }).notNull(),
    dueDate: varchar("dueDate", { length: 20 }),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    repayments: json("repayments").$type<{ date: string; amount: number; note?: string }[]>(),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    ownerIdx: index("loan_owner_idx").on(table.ownerId),
  })
);

/** One-off costs associated with purchasing a property (legal, agent, tax, etc.). */
export const purchaseCosts = mysqlTable(
  "purchaseCosts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    label: varchar("label", { length: 200 }).notNull(),
    amount: int("amount").notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    category: varchar("category", { length: 100 }),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    attachments: json("attachments").$type<string[]>(),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    ownerIdx: index("purchase_cost_owner_idx").on(table.ownerId),
  })
);

/** Maintenance / repair tasks tracked through a pipeline. */
export const repairs = mysqlTable(
  "repairs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    category: mysqlEnum("category", [
      "Plumbing",
      "Electrical",
      "HVAC",
      "Structural",
      "Appliance",
      "Cosmetic",
      "Other",
    ])
      .notNull()
      .default("Other"),
    status: mysqlEnum("status", ["Open", "In Progress", "Resolved", "Cancelled"])
      .notNull()
      .default("Open"),
    priority: mysqlEnum("priority", ["Low", "Medium", "High", "Critical"])
      .notNull()
      .default("Medium"),
    description: text("description"),
    reportedById: int("reportedById")
      .notNull()
      .references(() => users.id),
    assignedToId: int("assignedToId"),
    estimatedCost: int("estimatedCost"),
    actualCost: int("actualCost"),
    scheduledDate: varchar("scheduledDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    attachments: json("attachments").$type<string[]>(),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    propertyId: int("propertyId").notNull().default(1),
    phase: mysqlEnum("phase", [
      "Planning",
      "Quoting",
      "Scheduled",
      "InProgress",
      "Review",
      "Done",
      "Cancelled",
    ]).default("Planning"),
  },
  (table) => ({
    statusIdx: index("repair_status_idx").on(table.status),
    priorityIdx: index("repair_priority_idx").on(table.priority),
    reportedByIdx: index("repair_reported_by_idx").on(table.reportedById),
  })
);

/** Vendor quotes attached to a repair job. */
export const repairQuotes = mysqlTable(
  "repairQuotes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    repairId: varchar("repairId", { length: 36 })
      .notNull()
      .references(() => repairs.id),
    vendorName: varchar("vendorName", { length: 200 }).notNull(),
    amount: int("amount").notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    notes: text("notes"),
    isSelected: boolean("isSelected").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    repairIdx: index("repair_quote_repair_idx").on(table.repairId),
  })
);

/** Planned or completed home improvement projects. */
export const upgrades = mysqlTable(
  "upgrades",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    category: mysqlEnum("category", [
      "Kitchen",
      "Bathroom",
      "Bedroom",
      "LivingRoom",
      "Exterior",
      "Garden",
      "Office",
      "Other",
    ])
      .notNull()
      .default("Other"),
    status: mysqlEnum("status", [
      "Idea",
      "Planning",
      "In Progress",
      "Completed",
      "On Hold",
      "Cancelled",
    ])
      .notNull()
      .default("Idea"),
    priority: mysqlEnum("priority", ["Low", "Medium", "High"]).notNull().default("Medium"),
    description: text("description"),
    estimatedCost: int("estimatedCost"),
    actualCost: int("actualCost"),
    startDate: varchar("startDate", { length: 20 }),
    completedDate: varchar("completedDate", { length: 20 }),
    contractor: varchar("contractor", { length: 200 }),
    attachments: json("attachments").$type<string[]>(),
    notes: text("notes"),
    calendarEventId: varchar("calendarEventId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    ownerId: int("ownerId").notNull().default(1),
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    statusIdx: index("upgrade_status_idx").on(table.status),
    priorityIdx: index("upgrade_priority_idx").on(table.priority),
  })
);

/** Items the household wants to buy eventually. */
export const wishlist = mysqlTable(
  "wishlist",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    estimatedPrice: int("estimatedPrice"),
    priority: mysqlEnum("priority", ["Low", "Medium", "High"]).notNull().default("Medium"),
    status: mysqlEnum("status", ["Wanted", "Saved", "Purchased"]).notNull().default("Wanted"),
    url: text("url"),
    notes: text("notes"),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    ownerIdx: index("wishlist_owner_idx").on(table.ownerId),
  })
);

/** Calendar events linked optionally to other entities. */
export const calendarEvents = mysqlTable(
  "calendarEvents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    date: varchar("date", { length: 20 }).notNull(),
    time: varchar("time", { length: 20 }),
    eventType: mysqlEnum("eventType", ["Expense", "Repair", "Upgrade", "Loan", "Other"]).notNull(),
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
    propertyId: int("propertyId").notNull().default(1),
  },
  (table) => ({
    dateIdx: index("calendar_date_idx").on(table.date),
    createdByIdx: index("calendar_created_by_idx").on(table.createdById),
  })
);

/** Household inventory — appliances, furniture, valuables, consumables. */
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
    purchasePrice: int("purchasePrice"), // In cents
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
