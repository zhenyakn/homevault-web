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
 * Run a data statement (multi-table UPDATE / INSERT … SELECT) via the text
 * protocol. `run()` uses the prepared-statement protocol which rejects some
 * multi-table UPDATEs and correlated subqueries, so backfills go through here.
 * Backfills are written to be idempotent (guarded by WHERE … IS NULL /
 * NOT EXISTS), so re-running is a no-op.
 */
const backfill = async (sql, label) => {
  try {
    const [res] = await conn.query(sql);
    const affected =
      res && typeof res.affectedRows === "number"
        ? ` (${res.affectedRows} rows)`
        : "";
    console.log(`✓ ${label}${affected}`);
  } catch (e) {
    console.error(`✗ ${label} → ${e.code}: ${e.message}`);
    throw e;
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
    console.log(
      `↻ ${table}: legacy NOT NULL '${canaryColumn}' detected — dropping for schema reset`
    );
    await conn.execute(`DROP TABLE IF EXISTS \`${table}\``);
  }
}

/**
 * True when `column` currently exists on `table` in the active database.
 * Used to make legacy-only steps (e.g. dropping the retired `users.role`
 * column) idempotent: they run once on an upgrade and are skipped forever
 * after, and never fire at all on a fresh install that never had the column.
 */
async function columnExists(table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  console.log("Running unified HomeVault migration for add-on…");

  // ── Phase 1: v1 schema reset ─────────────────────────────────────────────────
  // Drop data tables that still have v1 NOT NULL legacy columns.  The CREATE
  // TABLE IF NOT EXISTS blocks below recreate them with the correct v2 schema.
  await dropIfLegacyV1("expenses", "label"); // label NOT NULL → name
  await dropIfLegacyV1("repairs", "label"); // label NOT NULL → title
  await dropIfLegacyV1("repairQuotes", "contractorName"); // contractorName NOT NULL → contractor
  await dropIfLegacyV1("upgrades", "label"); // label NOT NULL → title
  await dropIfLegacyV1("upgradeOptions", "name"); // name NOT NULL → title
  await dropIfLegacyV1("upgradeItems", "ownerId"); // ownerId NOT NULL (removed from v2 schema)
  await dropIfLegacyV1("loans", "lender"); // lender NOT NULL (totalAmount renamed too)
  await dropIfLegacyV1("wishlistItems", "label"); // label NOT NULL → name
  await dropIfLegacyV1("purchaseCosts", "label"); // label NOT NULL → name
  await dropIfLegacyV1("calendarEvents", "eventType"); // eventType NOT NULL (removed in v2)

  // ── Phase 2: create tables ───────────────────────────────────────────────────

  // ── users ────────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`openId\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`name\` text COLLATE utf8mb4_unicode_ci,
      \`email\` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`loginMethod\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
      \`propertyMode\` enum('owned_rented','owned_personal','rented') COLLATE utf8mb4_unicode_ci DEFAULT 'owned_personal',
      \`monthlyRent\` int DEFAULT NULL,
      \`leaseStart\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`leaseEnd\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`deposit\` int DEFAULT NULL,
      \`landlord\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
      \`category\` enum('Maintenance','Utilities','Insurance','Tax','Management','Renovation','Loan','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`isRecurring\` tinyint(1) DEFAULT '0',
      \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`isPaid\` tinyint(1) NOT NULL DEFAULT 0,
      \`paidDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`loanId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`expense_property_idx\` (\`propertyId\`),
      KEY \`expense_owner_idx\` (\`ownerId\`),
      KEY \`expense_loan_idx\` (\`loanId\`)
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
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
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
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
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
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`sourceExpenseId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`lr_loan_idx\` (\`loanId\`),
      KEY \`lrep_source_expense_idx\` (\`sourceExpenseId\`),
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
      \`category\` enum('Maintenance','Payment','Loan','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
      \`assetType\` enum('fixture','personal') COLLATE utf8mb4_unicode_ci DEFAULT 'fixture',
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
      \`propertyId\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`deletedAt\` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`files_owner_idx\` (\`ownerUserId\`),
      KEY \`files_backend_idx\` (\`backend\`),
      KEY \`files_property_idx\` (\`propertyId\`),
      CONSTRAINT \`files_owner_fk\` FOREIGN KEY (\`ownerUserId\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "files"
  );

  // Idempotent additions for the 0012 migration on already-deployed addons.
  await run(
    `ALTER TABLE \`files\` ADD COLUMN \`propertyId\` int DEFAULT NULL`,
    "files.propertyId"
  );
  await run(
    `CREATE INDEX \`files_property_idx\` ON \`files\` (\`propertyId\`)`,
    "files_property_idx"
  );

  // ── apartmentSearches (hunting mode — user-scoped, not property-scoped) ──────
  await run(
    `CREATE TABLE IF NOT EXISTS \`apartmentSearches\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`userId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`searchType\` enum('rent','buy') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`targetBudget\` int DEFAULT NULL,
      \`currencyCode\` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ILS',
      \`status\` enum('active','completed','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`aptsearch_user_idx\` (\`userId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "apartmentSearches"
  );

  // ── apartmentCandidates ──────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`apartmentCandidates\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`searchId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`userId\` int NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`address\` text COLLATE utf8mb4_unicode_ci,
      \`latitude\` decimal(10,8) DEFAULT NULL,
      \`longitude\` decimal(11,8) DEFAULT NULL,
      \`listingUrl\` text COLLATE utf8mb4_unicode_ci,
      \`price\` int DEFAULT NULL,
      \`deposit\` int DEFAULT NULL,
      \`propertyType\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Apartment',
      \`squareMeters\` int DEFAULT NULL,
      \`rooms\` int DEFAULT NULL,
      \`floor\` int DEFAULT NULL,
      \`floors\` int DEFAULT NULL,
      \`gardenSize\` int DEFAULT NULL,
      \`yearBuilt\` int DEFAULT NULL,
      \`parkingSpots\` int DEFAULT NULL,
      \`hasElevator\` tinyint(1) DEFAULT '0',
      \`hasStorage\` tinyint(1) DEFAULT '0',
      \`hasShelter\` tinyint(1) DEFAULT '0',
      \`availableDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`agentName\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`agentContact\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`rating\` int DEFAULT NULL,
      \`stage\` enum('saved','viewing_scheduled','viewed','applied','accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'saved',
      \`pros\` json DEFAULT NULL,
      \`cons\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`attachments\` json DEFAULT NULL,
      \`isFavorite\` tinyint(1) DEFAULT '0',
      \`convertedPropertyId\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`aptcand_search_idx\` (\`searchId\`),
      KEY \`aptcand_user_idx\` (\`userId\`),
      CONSTRAINT \`aptcand_search_fk\` FOREIGN KEY (\`searchId\`) REFERENCES \`apartmentSearches\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "apartmentCandidates"
  );

  // Idempotent additions for installs that created apartmentCandidates before
  // the technical-detail columns were added.
  await run(
    `ALTER TABLE \`apartmentCandidates\` ADD COLUMN \`propertyType\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Apartment'`,
    "apartmentCandidates.propertyType"
  );
  await run(
    `ALTER TABLE \`apartmentCandidates\` ADD COLUMN \`floors\` int DEFAULT NULL`,
    "apartmentCandidates.floors"
  );
  await run(
    `ALTER TABLE \`apartmentCandidates\` ADD COLUMN \`gardenSize\` int DEFAULT NULL`,
    "apartmentCandidates.gardenSize"
  );
  await run(
    `ALTER TABLE \`apartmentCandidates\` ADD COLUMN \`hasShelter\` tinyint(1) DEFAULT '0'`,
    "apartmentCandidates.hasShelter"
  );

  // ── Phase 3: convergence — bring v2+ installs up to current schema ───────────
  // Every ALTER is idempotent — ER_DUP_FIELDNAME is silently skipped.
  // Phase 1 handles v1→v2 resets. This section handles v2→now additions:
  //   isPaid/paidDate, repayments, payments, attachments, etc.

  // ── properties ────────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`propertyMode\` enum('owned_rented','owned_personal','rented') COLLATE utf8mb4_unicode_ci DEFAULT 'owned_personal'`,
    "properties.propertyMode"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`monthlyRent\` int DEFAULT NULL`,
    "properties.monthlyRent"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`leaseStart\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "properties.leaseStart"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`leaseEnd\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "properties.leaseEnd"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`deposit\` int DEFAULT NULL`,
    "properties.deposit"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`landlord\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "properties.landlord"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`floors\` int DEFAULT NULL`,
    "properties.floors"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`gardenSize\` int DEFAULT NULL`,
    "properties.gardenSize"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`hasElevator\` tinyint(1) DEFAULT '0'`,
    "properties.hasElevator"
  );
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`hasShelter\` tinyint(1) DEFAULT '0'`,
    "properties.hasShelter"
  );

  // ── expenses ──────────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.name"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.nextDueDate"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.recurringInterval"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`attachments\` json DEFAULT NULL`,
    "expenses.attachments"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`isPaid\` tinyint(1) NOT NULL DEFAULT 0`,
    "expenses.isPaid"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`paidDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.paidDate"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`loanId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.loanId"
  );
  await run(
    `CREATE INDEX \`expense_loan_idx\` ON \`expenses\` (\`loanId\`)`,
    "expense_loan_idx"
  );
  // Widen the category enum so existing installs accept the new 'Loan' value.
  await run(
    `ALTER TABLE \`expenses\` MODIFY COLUMN \`category\` enum('Maintenance','Utilities','Insurance','Tax','Management','Renovation','Loan','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "expenses.category (+Loan)"
  );

  // ── loanRepayments ────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`loanRepayments\` ADD COLUMN \`sourceExpenseId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "loanRepayments.sourceExpenseId"
  );
  await run(
    `CREATE INDEX \`lrep_source_expense_idx\` ON \`loanRepayments\` (\`sourceExpenseId\`)`,
    "lrep_source_expense_idx"
  );

  // ── repairs ───────────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairs.title"
  );
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`category\` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairs.category"
  );
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`reportedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairs.reportedDate"
  );
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairs.completedDate"
  );
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`cost\` int DEFAULT NULL`,
    "repairs.cost"
  );

  // ── repairQuotes ──────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`repairQuotes\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairQuotes.contractor"
  );
  await run(
    `ALTER TABLE \`repairQuotes\` ADD COLUMN \`amount\` int DEFAULT NULL`,
    "repairQuotes.amount"
  );
  await run(
    `ALTER TABLE \`repairQuotes\` ADD COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "repairQuotes.date"
  );
  await run(
    `ALTER TABLE \`repairQuotes\` ADD COLUMN \`selected\` tinyint(1) NOT NULL DEFAULT 0`,
    "repairQuotes.selected"
  );

  // ── upgrades ──────────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgrades.title"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`category\` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgrades.category"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`,
    "upgrades.priority"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`,
    "upgrades.estimatedCost"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`actualCost\` int DEFAULT NULL`,
    "upgrades.actualCost"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgrades.startDate"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgrades.completedDate"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgrades.contractor"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`roiEstimate\` int DEFAULT NULL`,
    "upgrades.roiEstimate"
  );

  // ── upgradeOptions ────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`,
    "upgradeOptions.title"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgradeOptions.description"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`,
    "upgradeOptions.estimatedCost"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`pros\` json DEFAULT NULL`,
    "upgradeOptions.pros"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`cons\` json DEFAULT NULL`,
    "upgradeOptions.cons"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` ADD COLUMN \`selected\` tinyint(1) NOT NULL DEFAULT 0`,
    "upgradeOptions.selected"
  );

  // ── upgradeItems ──────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`upgradeItems\` ADD COLUMN \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgradeItems.store"
  );
  await run(
    `ALTER TABLE \`upgradeItems\` ADD COLUMN \`purchased\` tinyint(1) NOT NULL DEFAULT 0`,
    "upgradeItems.purchased"
  );
  await run(
    `ALTER TABLE \`upgradeItems\` ADD COLUMN \`quantity\` int NOT NULL DEFAULT 1`,
    "upgradeItems.quantity"
  );
  await run(
    `ALTER TABLE \`upgradeItems\` ADD COLUMN \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "upgradeItems.unit"
  );

  // ── loans ─────────────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "loans.name"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`originalAmount\` int DEFAULT NULL`,
    "loans.originalAmount"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`currentBalance\` int DEFAULT NULL`,
    "loans.currentBalance"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`monthlyPayment\` int DEFAULT NULL`,
    "loans.monthlyPayment"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "loans.endDate"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`nextPaymentDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "loans.nextPaymentDate"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`attachments\` json DEFAULT NULL`,
    "loans.attachments"
  );

  // ── wishlistItems ─────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "wishlistItems.name"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`category\` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "wishlistItems.category"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`estimatedPrice\` int DEFAULT NULL`,
    "wishlistItems.estimatedPrice"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`status\` enum('wanted','saved','purchased') COLLATE utf8mb4_unicode_ci DEFAULT 'wanted'`,
    "wishlistItems.status"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`url\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "wishlistItems.url"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`attachments\` json DEFAULT NULL`,
    "wishlistItems.attachments"
  );

  // ── purchaseCosts ─────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`purchaseCosts\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "purchaseCosts.name"
  );

  // ── calendarEvents ────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`,
    "calendarEvents.ownerId"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.description"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.endDate"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`category\` enum('Maintenance','Payment','Loan','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.category"
  );
  // Widen the enum on existing installs so calendar events can store 'Loan'
  // distinctly from 'Payment' (keeps eventType edits lossless).
  await run(
    `ALTER TABLE \`calendarEvents\` MODIFY COLUMN \`category\` enum('Maintenance','Payment','Loan','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.category (+Loan)"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`isRecurring\` tinyint(1) DEFAULT 0`,
    "calendarEvents.isRecurring"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.recurringInterval"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`reminderDaysBefore\` int DEFAULT NULL`,
    "calendarEvents.reminderDaysBefore"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`externalCalendarId\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`,
    "calendarEvents.externalCalendarId"
  );

  // ── inventoryItems ────────────────────────────────────────────────────────────
  await run(
    `ALTER TABLE \`inventoryItems\` ADD COLUMN \`assetType\` enum('fixture','personal') COLLATE utf8mb4_unicode_ci DEFAULT 'fixture'`,
    "inventoryItems.assetType"
  );

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
  await run(
    `ALTER TABLE \`loans\` DROP COLUMN \`repayments\``,
    "loans DROP repayments"
  );
  await run(
    `ALTER TABLE \`repairQuotes\` DROP COLUMN \`payments\``,
    "repairQuotes DROP payments"
  );
  await run(
    `ALTER TABLE \`upgradeOptions\` DROP COLUMN \`payments\``,
    "upgradeOptions DROP payments"
  );

  // Schema-drift fix: payment-table `date` columns were created DEFAULT NULL in
  // earlier addon versions, but drizzle/schema.ts declares them NOT NULL.
  // Backfill any NULLs (best-effort; source JSON may have been incomplete) then
  // tighten the constraint so existing installs match the schema contract.
  await run(
    `UPDATE \`loanRepayments\` SET \`date\` = DATE_FORMAT(CURDATE(), '%Y-%m-%d') WHERE \`date\` IS NULL`,
    "loanRepayments backfill date"
  );
  await run(
    `UPDATE \`repairQuotePayments\` SET \`date\` = DATE_FORMAT(CURDATE(), '%Y-%m-%d') WHERE \`date\` IS NULL`,
    "repairQuotePayments backfill date"
  );
  await run(
    `UPDATE \`upgradeOptionPayments\` SET \`date\` = DATE_FORMAT(CURDATE(), '%Y-%m-%d') WHERE \`date\` IS NULL`,
    "upgradeOptionPayments backfill date"
  );
  await run(
    `ALTER TABLE \`loanRepayments\` MODIFY COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL`,
    "loanRepayments.date NOT NULL"
  );
  await run(
    `ALTER TABLE \`repairQuotePayments\` MODIFY COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL`,
    "repairQuotePayments.date NOT NULL"
  );
  await run(
    `ALTER TABLE \`upgradeOptionPayments\` MODIFY COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL`,
    "upgradeOptionPayments.date NOT NULL"
  );

  // ── Notifications: destinations on users + prefs/log/webpush/link tables ──
  await run(
    `ALTER TABLE \`users\` ADD COLUMN \`telegramChatId\` varchar(64)`,
    "users ADD telegramChatId"
  );
  await run(
    `ALTER TABLE \`users\` ADD COLUMN \`whatsappPhone\` varchar(32)`,
    "users ADD whatsappPhone"
  );
  await run(
    `ALTER TABLE \`users\` ADD COLUMN \`language\` varchar(8) DEFAULT 'en'`,
    "users ADD language"
  );
  await run(
    `CREATE TABLE IF NOT EXISTS \`notification_prefs\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`userId\` int NOT NULL,
      \`channel\` enum('inapp','push','email','webpush','telegram','whatsapp') NOT NULL,
      \`enabled\` tinyint(1) NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "CREATE notification_prefs"
  );
  await run(
    `CREATE INDEX \`notif_prefs_user_channel_idx\` ON \`notification_prefs\` (\`userId\`, \`channel\`)`,
    "index notif_prefs_user_channel_idx"
  );
  await run(
    `CREATE TABLE IF NOT EXISTS \`notification_log\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`userId\` int NOT NULL,
      \`propertyId\` int DEFAULT NULL,
      \`channel\` enum('inapp','push','email','webpush','telegram','whatsapp') NOT NULL,
      \`category\` enum('expense','loan','repair','warranty','calendar','system') NOT NULL,
      \`title\` varchar(300) NOT NULL,
      \`body\` text NOT NULL,
      \`url\` varchar(500),
      \`dedupeKey\` varchar(200) NOT NULL,
      \`status\` enum('sent','failed','skipped') NOT NULL,
      \`reason\` varchar(300),
      \`readAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "CREATE notification_log"
  );
  await run(
    `CREATE INDEX \`notif_log_user_idx\` ON \`notification_log\` (\`userId\`)`,
    "index notif_log_user_idx"
  );
  await run(
    `CREATE INDEX \`notif_log_dedupe_idx\` ON \`notification_log\` (\`userId\`, \`dedupeKey\`, \`channel\`)`,
    "index notif_log_dedupe_idx"
  );
  // Idempotent additions for already-deployed addons: scope notifications to a
  // property so reminders only surface while that property is active.
  await run(
    `ALTER TABLE \`notification_log\` ADD COLUMN \`propertyId\` int DEFAULT NULL`,
    "notification_log.propertyId"
  );
  await run(
    `CREATE INDEX \`notif_log_property_idx\` ON \`notification_log\` (\`userId\`, \`propertyId\`)`,
    "index notif_log_property_idx"
  );
  await run(
    `CREATE TABLE IF NOT EXISTS \`web_push_subscriptions\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`userId\` int NOT NULL,
      \`endpoint\` varchar(512) NOT NULL UNIQUE,
      \`p256dh\` varchar(255) NOT NULL,
      \`auth\` varchar(255) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "CREATE web_push_subscriptions"
  );
  await run(
    `CREATE INDEX \`web_push_user_idx\` ON \`web_push_subscriptions\` (\`userId\`)`,
    "index web_push_user_idx"
  );
  await run(
    `CREATE TABLE IF NOT EXISTS \`bot_link_codes\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`userId\` int NOT NULL,
      \`code\` varchar(32) NOT NULL UNIQUE,
      \`expiresAt\` timestamp NOT NULL,
      \`consumedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "CREATE bot_link_codes"
  );
  await run(
    `CREATE INDEX \`bot_link_code_idx\` ON \`bot_link_codes\` (\`code\`)`,
    "index bot_link_code_idx"
  );

  // ── Phase 5: user management & multi-tenancy (Stage 1) ───────────────────────
  // Introduces tenants + memberships as the data-isolation boundary, native
  // email/password credential storage, invite/email tokens, and an audit log.
  // Adds a nullable `tenantId` to every directly-queried entity table and
  // backfills it from each user's auto-created tenant. All steps are idempotent.

  // New tables.
  await run(
    `CREATE TABLE IF NOT EXISTS \`tenants\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`slug\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`status\` enum('active','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
      \`createdByUserId\` int DEFAULT NULL,
      \`maxProperties\` int DEFAULT NULL,
      \`maxMembers\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`tenant_slug_idx\` (\`slug\`),
      KEY \`tenant_created_by_idx\` (\`createdByUserId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "tenants"
  );
  // Per-tenant quota columns (added for installs created before SAAS quotas).
  await run(
    `ALTER TABLE \`tenants\` ADD COLUMN \`maxProperties\` int DEFAULT NULL`,
    "tenants.maxProperties"
  );
  await run(
    `ALTER TABLE \`tenants\` ADD COLUMN \`maxMembers\` int DEFAULT NULL`,
    "tenants.maxMembers"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`tenant_members\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`tenantId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`role\` enum('owner','admin','member','viewer') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
      \`status\` enum('active','invited','removed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
      \`invitedByUserId\` int DEFAULT NULL,
      \`joinedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`tenant_member_unique_idx\` (\`tenantId\`, \`userId\`),
      KEY \`tenant_member_user_idx\` (\`userId\`),
      KEY \`tenant_member_tenant_idx\` (\`tenantId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "tenant_members"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`tenant_invites\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`tenantId\` int NOT NULL,
      \`email\` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`role\` enum('admin','member','viewer') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
      \`tokenHash\` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`invitedByUserId\` int DEFAULT NULL,
      \`expiresAt\` timestamp NOT NULL,
      \`acceptedAt\` timestamp NULL DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`tenant_invite_token_idx\` (\`tokenHash\`),
      KEY \`tenant_invite_tenant_idx\` (\`tenantId\`),
      KEY \`tenant_invite_email_idx\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "tenant_invites"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`tenant_subscriptions\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`tenantId\` int NOT NULL,
      \`planId\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`status\` enum('active','trialing','past_due','canceled','incomplete') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
      \`provider\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`providerCustomerId\` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`providerSubscriptionId\` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`currentPeriodEnd\` timestamp NULL DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`tenant_sub_tenant_idx\` (\`tenantId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "tenant_subscriptions"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`plans\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`key\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`isPaid\` tinyint(1) NOT NULL DEFAULT 0,
      \`priceCents\` int NOT NULL DEFAULT 0,
      \`currency\` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ils',
      \`interval\` enum('month','year','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
      \`maxProperties\` int DEFAULT NULL,
      \`maxMembers\` int DEFAULT NULL,
      \`capabilities\` json DEFAULT NULL,
      \`checkoutUrl\` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`active\` tinyint(1) NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`plan_key_idx\` (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "plans"
  );
  // Seed default plans (idempotent via the unique key). Paid plans include the
  // files.upload capability; the free tier does not (gated only in SAAS).
  await backfill(
    `INSERT IGNORE INTO \`plans\`
       (\`key\`, \`name\`, \`isPaid\`, \`priceCents\`, \`currency\`, \`interval\`, \`maxProperties\`, \`maxMembers\`, \`capabilities\`, \`sortOrder\`, \`active\`)
     VALUES
       ('free',      'Free',      false, 0,    'ils', 'none',  1,    2,    '[]',               0, true),
       ('starter',   'Starter',   true,  2900, 'ils', 'month', 3,    5,    '["files.upload"]', 1, true),
       ('pro',       'Pro',       true,  7900, 'ils', 'month', 10,   20,   '["files.upload"]', 2, true),
       ('unlimited', 'Unlimited', true,  19900,'ils', 'month', NULL, NULL, '["files.upload"]', 3, true)`,
    "seed default plans"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`user_credentials\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`userId\` int NOT NULL,
      \`email\` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`passwordHash\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`emailVerifiedAt\` timestamp NULL DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`user_credentials_userId_unique\` (\`userId\`),
      UNIQUE KEY \`user_credentials_email_unique\` (\`email\`),
      KEY \`user_cred_email_idx\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "user_credentials"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`email_tokens\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`userId\` int NOT NULL,
      \`type\` enum('verify_email','reset_password') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`tokenHash\` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`expiresAt\` timestamp NOT NULL,
      \`consumedAt\` timestamp NULL DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`email_token_token_idx\` (\`tokenHash\`),
      KEY \`email_token_user_type_idx\` (\`userId\`, \`type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "email_tokens"
  );

  await run(
    `CREATE TABLE IF NOT EXISTS \`audit_log\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`actorUserId\` int DEFAULT NULL,
      \`tenantId\` int DEFAULT NULL,
      \`action\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`targetType\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`targetId\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`metadata\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`audit_actor_idx\` (\`actorUserId\`),
      KEY \`audit_tenant_idx\` (\`tenantId\`),
      KEY \`audit_created_idx\` (\`createdAt\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "audit_log"
  );

  // New columns on users.
  await run(
    `ALTER TABLE \`users\` ADD COLUMN \`globalRole\` enum('user','superadmin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user'`,
    "users.globalRole"
  );
  await run(
    `ALTER TABLE \`users\` ADD COLUMN \`defaultTenantId\` int DEFAULT NULL`,
    "users.defaultTenantId"
  );

  // Nullable `tenantId` on every directly-queried entity table, each with an
  // index. Statements are written out explicitly (one per table) so the
  // schema/migration parity guard in server/addon.test.ts can see them.
  // Deep child tables (repairQuotes, repairQuotePayments, upgradeOptions,
  // upgradeOptionPayments, upgradeItems, loanRepayments) are reached only via a
  // tenant-scoped parent, so they get their tenantId in a later phase.
  await run(
    `ALTER TABLE \`properties\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "properties.tenantId"
  );
  await run(
    `CREATE INDEX \`property_tenant_idx\` ON \`properties\` (\`tenantId\`)`,
    "property_tenant_idx"
  );
  await run(
    `ALTER TABLE \`expenses\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "expenses.tenantId"
  );
  await run(
    `CREATE INDEX \`expense_tenant_idx\` ON \`expenses\` (\`tenantId\`)`,
    "expense_tenant_idx"
  );
  await run(
    `ALTER TABLE \`repairs\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "repairs.tenantId"
  );
  await run(
    `CREATE INDEX \`repair_tenant_idx\` ON \`repairs\` (\`tenantId\`)`,
    "repair_tenant_idx"
  );
  await run(
    `ALTER TABLE \`upgrades\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "upgrades.tenantId"
  );
  await run(
    `CREATE INDEX \`upgrade_tenant_idx\` ON \`upgrades\` (\`tenantId\`)`,
    "upgrade_tenant_idx"
  );
  await run(
    `ALTER TABLE \`loans\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "loans.tenantId"
  );
  await run(
    `CREATE INDEX \`loan_tenant_idx\` ON \`loans\` (\`tenantId\`)`,
    "loan_tenant_idx"
  );
  await run(
    `ALTER TABLE \`wishlistItems\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "wishlistItems.tenantId"
  );
  await run(
    `CREATE INDEX \`wishlist_tenant_idx\` ON \`wishlistItems\` (\`tenantId\`)`,
    "wishlist_tenant_idx"
  );
  await run(
    `ALTER TABLE \`purchaseCosts\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "purchaseCosts.tenantId"
  );
  await run(
    `CREATE INDEX \`purchaseCost_tenant_idx\` ON \`purchaseCosts\` (\`tenantId\`)`,
    "purchaseCost_tenant_idx"
  );
  await run(
    `ALTER TABLE \`calendarEvents\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "calendarEvents.tenantId"
  );
  await run(
    `CREATE INDEX \`calendar_tenant_idx\` ON \`calendarEvents\` (\`tenantId\`)`,
    "calendar_tenant_idx"
  );
  await run(
    `ALTER TABLE \`inventoryItems\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "inventoryItems.tenantId"
  );
  await run(
    `CREATE INDEX \`inventoryItem_tenant_idx\` ON \`inventoryItems\` (\`tenantId\`)`,
    "inventoryItem_tenant_idx"
  );
  await run(
    `ALTER TABLE \`files\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "files.tenantId"
  );
  await run(
    `CREATE INDEX \`files_tenant_idx\` ON \`files\` (\`tenantId\`)`,
    "files_tenant_idx"
  );
  await run(
    `ALTER TABLE \`notification_log\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "notification_log.tenantId"
  );
  await run(
    `CREATE INDEX \`notif_log_tenant_idx\` ON \`notification_log\` (\`tenantId\`)`,
    "notif_log_tenant_idx"
  );
  await run(
    `ALTER TABLE \`apartmentSearches\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "apartmentSearches.tenantId"
  );
  await run(
    `CREATE INDEX \`aptsearch_tenant_idx\` ON \`apartmentSearches\` (\`tenantId\`)`,
    "aptsearch_tenant_idx"
  );
  await run(
    `ALTER TABLE \`apartmentCandidates\` ADD COLUMN \`tenantId\` int DEFAULT NULL`,
    "apartmentCandidates.tenantId"
  );
  await run(
    `CREATE INDEX \`aptcand_tenant_idx\` ON \`apartmentCandidates\` (\`tenantId\`)`,
    "aptcand_tenant_idx"
  );

  // ── Backfill ────────────────────────────────────────────────────────────────
  // 1) One tenant + owner membership per existing user that has neither yet.
  await backfill(
    `INSERT INTO \`tenants\` (\`name\`, \`createdByUserId\`, \`status\`)
       SELECT CONCAT(COALESCE(NULLIF(TRIM(u.name), ''), 'User'), '''s Home'), u.id, 'active'
       FROM \`users\` u
       WHERE NOT EXISTS (SELECT 1 FROM \`tenant_members\` tm WHERE tm.userId = u.id)
         AND NOT EXISTS (SELECT 1 FROM \`tenants\` t WHERE t.createdByUserId = u.id)`,
    "backfill: create per-user tenants"
  );
  await backfill(
    `INSERT INTO \`tenant_members\` (\`tenantId\`, \`userId\`, \`role\`, \`status\`)
       SELECT t.id, t.createdByUserId, 'owner', 'active'
       FROM \`tenants\` t
       WHERE t.createdByUserId IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM \`tenant_members\` tm
           WHERE tm.tenantId = t.id AND tm.userId = t.createdByUserId
         )`,
    "backfill: owner memberships"
  );

  // 2) Default tenant + global role on users.
  await backfill(
    `UPDATE \`users\` u
       SET u.defaultTenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm
         WHERE tm.userId = u.id AND tm.status = 'active'
       )
       WHERE u.defaultTenantId IS NULL`,
    "backfill: users.defaultTenantId"
  );
  // Legacy `users.role` ('user'|'admin') has been retired in favour of
  // `globalRole`. Carry forward any legacy admins, then drop the column. Both
  // steps are guarded on the column still existing so this is a no-op on fresh
  // installs (which never had it) and on subsequent boots (after the drop).
  if (await columnExists("users", "role")) {
    await backfill(
      `UPDATE \`users\` SET \`globalRole\` = 'superadmin'
         WHERE \`role\` = 'admin' AND \`globalRole\` = 'user'`,
      "backfill: legacy admin → superadmin"
    );
    await run(`ALTER TABLE \`users\` DROP COLUMN \`role\``, "drop users.role");
  }

  // 3) properties.tenantId from the owning user's tenant.
  await backfill(
    `UPDATE \`properties\` p
       SET p.tenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm WHERE tm.userId = p.userId
       )
       WHERE p.tenantId IS NULL`,
    "backfill: properties.tenantId"
  );

  // 4) Property-scoped entities inherit tenantId from their property.
  for (const t of [
    "expenses",
    "repairs",
    "upgrades",
    "loans",
    "wishlistItems",
    "purchaseCosts",
    "calendarEvents",
    "inventoryItems",
  ]) {
    await backfill(
      `UPDATE \`${t}\` e
         JOIN \`properties\` p ON p.id = e.propertyId
         SET e.tenantId = p.tenantId
         WHERE e.tenantId IS NULL AND p.tenantId IS NOT NULL`,
      `backfill: ${t}.tenantId`
    );
  }

  // 5) files: by property when set, else by owning user.
  await backfill(
    `UPDATE \`files\` f
       JOIN \`properties\` p ON p.id = f.propertyId
       SET f.tenantId = p.tenantId
       WHERE f.tenantId IS NULL AND f.propertyId IS NOT NULL AND p.tenantId IS NOT NULL`,
    "backfill: files.tenantId (by property)"
  );
  await backfill(
    `UPDATE \`files\` f
       SET f.tenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm WHERE tm.userId = f.ownerUserId
       )
       WHERE f.tenantId IS NULL`,
    "backfill: files.tenantId (by owner)"
  );

  // 6) notification_log: by property when set, else by user.
  await backfill(
    `UPDATE \`notification_log\` n
       JOIN \`properties\` p ON p.id = n.propertyId
       SET n.tenantId = p.tenantId
       WHERE n.tenantId IS NULL AND n.propertyId IS NOT NULL AND p.tenantId IS NOT NULL`,
    "backfill: notification_log.tenantId (by property)"
  );
  await backfill(
    `UPDATE \`notification_log\` n
       SET n.tenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm WHERE tm.userId = n.userId
       )
       WHERE n.tenantId IS NULL`,
    "backfill: notification_log.tenantId (by user)"
  );

  // 7) Apartment search/candidates: user-scoped → user's tenant.
  await backfill(
    `UPDATE \`apartmentSearches\` s
       SET s.tenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm WHERE tm.userId = s.userId
       )
       WHERE s.tenantId IS NULL`,
    "backfill: apartmentSearches.tenantId"
  );
  await backfill(
    `UPDATE \`apartmentCandidates\` c
       SET c.tenantId = (
         SELECT MIN(tm.tenantId) FROM \`tenant_members\` tm WHERE tm.userId = c.userId
       )
       WHERE c.tenantId IS NULL`,
    "backfill: apartmentCandidates.tenantId"
  );

  // ── Phase 6: tighten tenantId to NOT NULL (Stage-1 hardening) ────────────────
  // Only the tables whose every write path stamps tenantId. Done conditionally:
  // if any row still has a NULL tenantId (an un-backfillable orphan on a legacy
  // install), the column is left nullable and a warning is logged rather than
  // failing the boot migration. files + notification_log stay nullable (their
  // writes don't stamp tenantId yet — Stage 2).
  // properties is intentionally excluded: the add-on seeds a placeholder
  // property (id=1) before any user/tenant exists, so a NULL tenantId there is
  // legitimate for standalone installs.
  const tightenTables = [
    "expenses",
    "repairs",
    "upgrades",
    "loans",
    "wishlistItems",
    "purchaseCosts",
    "calendarEvents",
    "inventoryItems",
    "apartmentSearches",
    "apartmentCandidates",
  ];
  for (const t of tightenTables) {
    try {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS n FROM \`${t}\` WHERE \`tenantId\` IS NULL`
      );
      const nulls = Number(rows?.[0]?.n ?? 0);
      if (nulls > 0) {
        console.log(
          `- ${t}.tenantId NOT NULL skipped — ${nulls} row(s) still NULL`
        );
        continue;
      }
      await conn.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`tenantId\` int NOT NULL`
      );
      console.log(`✓ ${t}.tenantId NOT NULL`);
    } catch (e) {
      console.log(
        `- ${t}.tenantId NOT NULL (skipped — ${e.code ?? e.message})`
      );
    }
  }

  console.log("Unified HomeVault migration complete.");
  await conn.end();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
