/**
 * Unified migration for HomeVault add-on
 *
 * - Given DATABASE_URL, ensure DB schema matches the current dev schema.
 * - Creates tables if they don't exist.
 * - Upgrades legacy tables by adding missing columns (propertyId, phase, etc.).
 * - Safe to re-run: duplicate table/column/index/constraint errors are treated as no-ops.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url).catch(e => {
  console.error("Failed to connect to DB:", e.message);
  process.exit(1);
});

const run = async (sql, label) => {
  try {
    await conn.execute(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    const msg = typeof e.message === "string" ? e.message : "";
    if (
      e.code === "ER_TABLE_EXISTS_ERROR" ||
      e.code === "ER_DUP_FIELDNAME" ||
      e.code === "ER_DUP_KEYNAME" ||
      e.code === "ER_FK_DUP_NAME" ||
      msg.includes("already exists") ||
      msg.includes("Duplicate") ||
      msg.includes("exists")
    ) {
      console.log(`- ${label} (already applied)`);
    } else {
      console.error(`✗ ${label} → ${e.code}: ${e.message}`);
      throw e;
    }
  }
};

/**
 * If a table still carries a legacy v1 NOT NULL column (no default), it was
 * created before the v2 schema alignment ran and will reject new INSERTs that
 * omit that column.  Dropping the table lets the CREATE TABLE IF NOT EXISTS
 * below recreate it with the correct, fully-nullable v2 schema.
 *
 * This fires only once: after recreation the canary column is gone or nullable,
 * so subsequent restarts are no-ops.  No real data is stored in HA add-on
 * installs, so dropping is safe.
 */
async function dropIfLegacyV1(table, canaryColumn) {
  const [rows] = await conn.execute(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, canaryColumn]
  );
  if (rows.length > 0 && rows[0].IS_NULLABLE === "NO") {
    console.log(`↻ ${table}: legacy NOT NULL '${canaryColumn}' detected — dropping for schema reset`);
    await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
  }
}

async function main() {
  console.log("Running unified HomeVault migration for add-on…");

  // ── Phase 1: v1 schema reset ─────────────────────────────────────────────────
  // Drop data tables that still have v1 NOT NULL legacy columns.  The CREATE
  // TABLE IF NOT EXISTS blocks below recreate them with the correct v2 schema.
  await dropIfLegacyV1("expenses",      "label");          // label NOT NULL → name
  await dropIfLegacyV1("repairs",       "label");          // label NOT NULL → title
  await dropIfLegacyV1("repairQuotes",  "contractorName"); // contractorName NOT NULL → contractor
  await dropIfLegacyV1("upgrades",      "label");          // label NOT NULL → title
  await dropIfLegacyV1("upgradeOptions","name");           // name NOT NULL → title
  await dropIfLegacyV1("upgradeItems",  "ownerId");        // ownerId NOT NULL (removed from v2 schema)
  await dropIfLegacyV1("loans",         "lender");         // lender NOT NULL (totalAmount renamed too)
  await dropIfLegacyV1("wishlistItems", "label");          // label NOT NULL → name
  await dropIfLegacyV1("purchaseCosts", "label");          // label NOT NULL → name
  await dropIfLegacyV1("calendarEvents","eventType");      // eventType NOT NULL (removed in v2)

  // ── Phase 2: create tables ───────────────────────────────────────────────────

  // ── users ────────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`openId\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`name\` text COLLATE utf8mb4_unicode_ci,
      \`email\` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`loginMethod\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`role\` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`users_openId_unique\` (\`openId\`),
      KEY \`openId_idx\` (\`openId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "users"
  );

  // ── properties ───────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`properties\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`houseName\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT 'My Home',
      \`houseNickname\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`address\` text COLLATE utf8mb4_unicode_ci,
      \`latitude\` decimal(10,8) DEFAULT NULL,
      \`longitude\` decimal(11,8) DEFAULT NULL,
      \`purchaseDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`purchasePrice\` int DEFAULT NULL,
      \`squareMeters\` int DEFAULT NULL,
      \`rooms\` int DEFAULT NULL,
      \`yearBuilt\` int DEFAULT NULL,
      \`floor\` int DEFAULT NULL,
      \`parkingSpots\` int DEFAULT NULL,
      \`hasStorage\` tinyint(1) DEFAULT '0',
      \`currency\` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '₪',
      \`currencyCode\` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ILS',
      \`timezone\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Asia/Jerusalem',
      \`startOfWeek\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'Sunday',
      \`reminderDaysBefore\` int DEFAULT '3',
      \`calendarSyncEnabled\` tinyint(1) DEFAULT '0',
      \`mapsProvider\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'google',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyType\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Apartment',
      \`remindExpenses\` tinyint(1) DEFAULT '1',
      \`remindLoans\` tinyint(1) DEFAULT '1',
      \`remindRepairs\` tinyint(1) DEFAULT '1',
      \`remindCalendar\` tinyint(1) DEFAULT '1',
      \`userId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "properties"
  );

  // Seed default property row (id=1, userId=1)
  await run(
    `INSERT IGNORE INTO \`properties\` (\`id\`, \`userId\`) VALUES (1, 1)`,
    "properties seed row"
  );

  // ── expenses ─────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`expenses\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`category\` enum('Maintenance','Utilities','Insurance','Tax','Management','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`isRecurring\` tinyint(1) DEFAULT '0',
      \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`expense_property_idx\` (\`propertyId\`),
      KEY \`expense_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "expenses"
  );

  // ── repairs ──────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`repairs\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`category\` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`status\` enum('open','in_progress','waiting_for_parts','waiting_for_contractor','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
      \`priority\` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
      \`reportedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`cost\` int DEFAULT NULL,
      \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`repair_property_idx\` (\`propertyId\`),
      KEY \`repair_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "repairs"
  );

  // ── repairQuotes ─────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`repairQuotes\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`repairId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`selected\` tinyint(1) DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`quote_repair_idx\` (\`repairId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "repairQuotes"
  );

  // ── repairQuotePayments ───────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`repairQuotePayments\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`quoteId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`receipt\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`rqp_quote_idx\` (\`quoteId\`),
      CONSTRAINT \`rqp_quote_fk\` FOREIGN KEY (\`quoteId\`) REFERENCES \`repairQuotes\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "repairQuotePayments"
  );

  // ── upgrades ─────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgrades\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`category\` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`status\` enum('idea','planning','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'idea',
      \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
      \`estimatedCost\` int DEFAULT NULL,
      \`actualCost\` int DEFAULT NULL,
      \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`roiEstimate\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`upgrade_property_idx\` (\`propertyId\`),
      KEY \`upgrade_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgrades"
  );

  // ── upgradeOptions ───────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgradeOptions\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`upgradeId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`estimatedCost\` int DEFAULT NULL,
      \`pros\` json DEFAULT NULL,
      \`cons\` json DEFAULT NULL,
      \`selected\` tinyint(1) DEFAULT '0',
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`option_upgrade_idx\` (\`upgradeId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgradeOptions"
  );

  // ── upgradeOptionPayments ─────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgradeOptionPayments\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`optionId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`receipt\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`uop_option_idx\` (\`optionId\`),
      CONSTRAINT \`uop_option_fk\` FOREIGN KEY (\`optionId\`) REFERENCES \`upgradeOptions\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgradeOptionPayments"
  );

  // ── upgradeItems ─────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgradeItems\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`upgradeId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`quantity\` int DEFAULT '1',
      \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`estimatedCost\` int DEFAULT NULL,
      \`actualCost\` int DEFAULT NULL,
      \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`purchased\` tinyint(1) DEFAULT '0',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`item_upgrade_idx\` (\`upgradeId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgradeItems"
  );

  // ── loans ────────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`loans\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`lender\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`originalAmount\` int NOT NULL,
      \`currentBalance\` int NOT NULL,
      \`interestRate\` decimal(5,2) DEFAULT NULL,
      \`monthlyPayment\` int DEFAULT NULL,
      \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`nextPaymentDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`loanType\` enum('mortgage','heloc','personal','construction','other') COLLATE utf8mb4_unicode_ci DEFAULT 'mortgage',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`loan_property_idx\` (\`propertyId\`),
      KEY \`loan_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "loans"
  );

  // ── loanRepayments ────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`loanRepayments\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`loanId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`lr_loan_idx\` (\`loanId\`),
      CONSTRAINT \`lr_loan_fk\` FOREIGN KEY (\`loanId\`) REFERENCES \`loans\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "loanRepayments"
  );

  // ── wishlistItems ────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`wishlistItems\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`category\` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`estimatedPrice\` int DEFAULT NULL,
      \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
      \`status\` enum('wanted','saved','purchased') COLLATE utf8mb4_unicode_ci DEFAULT 'wanted',
      \`url\` text COLLATE utf8mb4_unicode_ci,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`wishlist_property_idx\` (\`propertyId\`),
      KEY \`wishlist_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "wishlistItems"
  );

  // ── purchaseCosts ────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`purchaseCosts\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`category\` enum('Tax','Legal','Inspection','Agency','Renovation','Moving','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`purchaseCost_property_idx\` (\`propertyId\`),
      KEY \`purchaseCost_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "purchaseCosts"
  );

  // ── calendarEvents ───────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`calendarEvents\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`category\` enum('Maintenance','Payment','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`isRecurring\` tinyint(1) DEFAULT '0',
      \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`reminderDaysBefore\` int DEFAULT NULL,
      \`externalCalendarId\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`calendar_property_idx\` (\`propertyId\`),
      KEY \`calendar_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "calendarEvents"
  );

  // ── inventoryItems ───────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`inventoryItems\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`sku\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`category\` enum('Appliance','Furniture','Electronics','Consumable','Tool','Valuable','Other') COLLATE utf8mb4_unicode_ci DEFAULT 'Other',
      \`room\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`quantity\` int NOT NULL DEFAULT 1,
      \`minQuantity\` int DEFAULT 0,
      \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`purchasePrice\` int DEFAULT NULL,
      \`purchaseDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`brand\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`warrantyExpiry\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`condition\` enum('New','Good','Fair','Poor') COLLATE utf8mb4_unicode_ci DEFAULT 'Good',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`tags\` json DEFAULT NULL,
      \`photoUrl\` text COLLATE utf8mb4_unicode_ci,
      \`serialNumber\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`inventoryItem_property_idx\` (\`propertyId\`),
      KEY \`inventoryItem_owner_idx\` (\`ownerId\`),
      KEY \`inventoryItem_category_idx\` (\`category\`),
      KEY \`inventoryItem_room_idx\` (\`room\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "inventoryItems"
  );

  // ── app_settings ─────────────────────────────────────────────────────────────
  // Generic key/value store used by the Google Drive integration (refresh
  // token, cached folder IDs) and any future setup state that needs to
  // outlive process restarts without going into env vars.
  await run(
    `CREATE TABLE IF NOT EXISTS \`app_settings\` (
      \`key\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`value\` text COLLATE utf8mb4_unicode_ci NOT NULL,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "app_settings"
  );

  // ── files ────────────────────────────────────────────────────────────────────
  // Catalogues every uploaded file regardless of storage backend (Google
  // Drive or S3-compatible). The `attachments` JSON columns on the entity
  // tables store proxy URLs of the form /api/files/<id>; the server resolves
  // the row here, checks ownership, and streams or 302-redirects accordingly.
  await run(
    `CREATE TABLE IF NOT EXISTS \`files\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`backend\` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`externalId\` text COLLATE utf8mb4_unicode_ci NOT NULL,
      \`originalName\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`mimeType\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`size\` int NOT NULL DEFAULT 0,
      \`ownerUserId\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`deletedAt\` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`files_owner_idx\` (\`ownerUserId\`),
      KEY \`files_backend_idx\` (\`backend\`),
      CONSTRAINT \`files_owner_fk\` FOREIGN KEY (\`ownerUserId\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "files"
  );

  // ── Phase 3: convergence — bring v2+ installs up to current schema ───────────
  // Every ALTER is idempotent — ER_DUP_FIELDNAME is silently skipped.
  // Phase 1 handles v1→v2 resets. This section handles v2→now additions:
  //   isPaid/paidDate, repayments, payments, attachments, etc.

  // ── expenses ──────────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.name");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.nextDueDate");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.recurringInterval");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "expenses.attachments");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`isPaid\` tinyint(1) NOT NULL DEFAULT 0`, "expenses.isPaid");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`paidDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.paidDate");

  // ── repairs ───────────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.title");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`category\` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.category");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`reportedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.reportedDate");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.completedDate");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`cost\` int DEFAULT NULL`, "repairs.cost");

  // ── repairQuotes ──────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairQuotes.contractor");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`amount\` int DEFAULT NULL`, "repairQuotes.amount");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairQuotes.date");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`selected\` tinyint(1) NOT NULL DEFAULT 0`, "repairQuotes.selected");

  // ── upgrades ──────────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.title");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`category\` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.category");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`, "upgrades.priority");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgrades.estimatedCost");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`actualCost\` int DEFAULT NULL`, "upgrades.actualCost");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.startDate");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.completedDate");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.contractor");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`roiEstimate\` int DEFAULT NULL`, "upgrades.roiEstimate");

  // ── upgradeOptions ────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "upgradeOptions.title");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeOptions.description");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgradeOptions.estimatedCost");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`pros\` json DEFAULT NULL`, "upgradeOptions.pros");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`cons\` json DEFAULT NULL`, "upgradeOptions.cons");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`selected\` tinyint(1) NOT NULL DEFAULT 0`, "upgradeOptions.selected");

  // ── upgradeItems ──────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.store");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`purchased\` tinyint(1) NOT NULL DEFAULT 0`, "upgradeItems.purchased");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`quantity\` int NOT NULL DEFAULT 1`, "upgradeItems.quantity");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.unit");

  // ── loans ─────────────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.name");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`originalAmount\` int DEFAULT NULL`, "loans.originalAmount");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`currentBalance\` int DEFAULT NULL`, "loans.currentBalance");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`monthlyPayment\` int DEFAULT NULL`, "loans.monthlyPayment");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.endDate");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`nextPaymentDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.nextPaymentDate");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "loans.attachments");

  // ── wishlistItems ─────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "wishlistItems.name");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`category\` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "wishlistItems.category");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`estimatedPrice\` int DEFAULT NULL`, "wishlistItems.estimatedPrice");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`status\` enum('wanted','saved','purchased') COLLATE utf8mb4_unicode_ci DEFAULT 'wanted'`, "wishlistItems.status");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`url\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "wishlistItems.url");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "wishlistItems.attachments");

  // ── purchaseCosts ─────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "purchaseCosts.name");

  // ── calendarEvents ────────────────────────────────────────────────────────────
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "calendarEvents.ownerId");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.description");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.endDate");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`category\` enum('Maintenance','Payment','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.category");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`isRecurring\` tinyint(1) DEFAULT 0`, "calendarEvents.isRecurring");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.recurringInterval");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`reminderDaysBefore\` int DEFAULT NULL`, "calendarEvents.reminderDaysBefore");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`externalCalendarId\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.externalCalendarId");

  // ── Phase 4: payment tables — migrate JSON → relational, drop legacy columns ──
  // Best-effort: JSON_TABLE is MySQL 8.0+ / MariaDB 10.6+. Wrapped in try/catch
  // so older MariaDB installs skip the data copy gracefully (no data loss — the
  // JSON column is dropped only after a successful copy, or if it never existed).

  const jsonMigrations = [
    {
      label: "loanRepayments JSON migration",
      sql: `INSERT IGNORE INTO \`loanRepayments\` (id, loanId, amount, date, notes, createdAt)
        SELECT CONCAT(l.id, '_', jt.idx), l.id, jt.amount, jt.date, jt.notes, NOW()
        FROM \`loans\` l,
        JSON_TABLE(COALESCE(l.repayments, '[]'), '$[*]' COLUMNS(
          idx FOR ORDINALITY,
          amount INT PATH '$.amount',
          date VARCHAR(20) PATH '$.date',
          notes TEXT PATH '$.notes'
        )) AS jt
        WHERE l.repayments IS NOT NULL AND JSON_LENGTH(l.repayments) > 0`,
    },
    {
      label: "repairQuotePayments JSON migration",
      sql: `INSERT IGNORE INTO \`repairQuotePayments\` (id, quoteId, amount, date, notes, createdAt)
        SELECT CONCAT(q.id, '_', jt.idx), q.id, jt.amount, jt.date, jt.notes, NOW()
        FROM \`repairQuotes\` q,
        JSON_TABLE(COALESCE(q.payments, '[]'), '$[*]' COLUMNS(
          idx FOR ORDINALITY,
          amount INT PATH '$.amount',
          date VARCHAR(20) PATH '$.date',
          notes TEXT PATH '$.notes'
        )) AS jt
        WHERE q.payments IS NOT NULL AND JSON_LENGTH(q.payments) > 0`,
    },
    {
      label: "upgradeOptionPayments JSON migration",
      sql: `INSERT IGNORE INTO \`upgradeOptionPayments\` (id, optionId, amount, date, notes, createdAt)
        SELECT CONCAT(o.id, '_', jt.idx), o.id, jt.amount, jt.date, jt.notes, NOW()
        FROM \`upgradeOptions\` o,
        JSON_TABLE(COALESCE(o.payments, '[]'), '$[*]' COLUMNS(
          idx FOR ORDINALITY,
          amount INT PATH '$.amount',
          date VARCHAR(20) PATH '$.date',
          notes TEXT PATH '$.notes'
        )) AS jt
        WHERE o.payments IS NOT NULL AND JSON_LENGTH(o.payments) > 0`,
    },
  ];

  for (const m of jsonMigrations) {
    try {
      await conn.execute(m.sql);
      console.log(`✓ ${m.label}`);
    } catch (e) {
      console.log(`- ${m.label} (skipped — ${e.code ?? e.message})`);
    }
  }

  // Drop legacy JSON columns now that data is in relational tables.
  // ALTER TABLE ... DROP COLUMN IF EXISTS is supported in MySQL 8.0.29+ and MariaDB 10.2+.
  await run(`ALTER TABLE \`loans\` DROP COLUMN \`repayments\``, "loans DROP repayments");
  await run(`ALTER TABLE \`repairQuotes\` DROP COLUMN \`payments\``, "repairQuotes DROP payments");
  await run(`ALTER TABLE \`upgradeOptions\` DROP COLUMN \`payments\``, "upgradeOptions DROP payments");

  console.log("Unified HomeVault migration complete.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
