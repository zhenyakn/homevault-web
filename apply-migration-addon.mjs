/**
 * Unified migration for HomeVault add-on
 *
 * - Given DATABASE_URL, ensure DB schema matches the current dev schema.
 * - Creates tables if they don't exist.
 * - Upgrades legacy tables by adding missing columns.
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

async function main() {
  console.log("Running unified HomeVault migration for add-on…");

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
  // Legacy expenses used `label` instead of `name`; add missing columns.
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "expenses.name");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "expenses.ownerId");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "expenses.propertyId");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`nextDueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.nextDueDate");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "expenses.recurringInterval");
  await run(`ALTER TABLE \`expenses\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "expenses.updatedAt");

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
  // Legacy repairs used `label` and different enums; add/normalise missing columns.
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "repairs.title");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "repairs.ownerId");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "repairs.propertyId");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`category\` enum('Plumbing','Electrical','HVAC','Structural','Appliance','Cosmetic','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.category");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`reportedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.reportedDate");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairs.completedDate");
  await run(`ALTER TABLE \`repairs\` ADD COLUMN \`cost\` int DEFAULT NULL`, "repairs.cost");

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
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "repairQuotes.contractor");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`amount\` int NOT NULL DEFAULT 0`, "repairQuotes.amount");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`date\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "repairQuotes.date");
  await run(`ALTER TABLE \`repairQuotes\` ADD COLUMN \`selected\` tinyint(1) DEFAULT '0'`, "repairQuotes.selected");

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
      \`phase\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  // Legacy upgrades used `label`, `budget`, `spent`; add new columns.
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "upgrades.title");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "upgrades.ownerId");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "upgrades.propertyId");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`category\` enum('Kitchen','Bathroom','Bedroom','Living Room','Outdoor','Structural','Technology','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.category");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`priority\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium'`, "upgrades.priority");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgrades.estimatedCost");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`actualCost\` int DEFAULT NULL`, "upgrades.actualCost");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.startDate");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`completedDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.completedDate");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgrades.contractor");
  await run(`ALTER TABLE \`upgrades\` ADD COLUMN \`roiEstimate\` int DEFAULT NULL`, "upgrades.roiEstimate");

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
  // Legacy upgradeOptions used `name` instead of `title`; add new columns.
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "upgradeOptions.title");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci`, "upgradeOptions.description");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`estimatedCost\` int DEFAULT NULL`, "upgradeOptions.estimatedCost");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`pros\` json DEFAULT NULL`, "upgradeOptions.pros");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`cons\` json DEFAULT NULL`, "upgradeOptions.cons");
  await run(`ALTER TABLE \`upgradeOptions\` ADD COLUMN \`selected\` tinyint(1) DEFAULT '0'`, "upgradeOptions.selected");

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
  // Legacy upgradeItems had different columns; add missing ones.
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`quantity\` int DEFAULT '1'`, "upgradeItems.quantity");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.unit");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`store\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "upgradeItems.store");
  await run(`ALTER TABLE \`upgradeItems\` ADD COLUMN \`purchased\` tinyint(1) DEFAULT '0'`, "upgradeItems.purchased");

  // ── loans ────────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`loans\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`propertyId\` int NOT NULL,
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
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
  // Legacy loans had totalAmount/dueDate/repayments; add new schema columns.
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "loans.name");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "loans.ownerId");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "loans.propertyId");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`originalAmount\` int NOT NULL DEFAULT 0`, "loans.originalAmount");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`currentBalance\` int NOT NULL DEFAULT 0`, "loans.currentBalance");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`monthlyPayment\` int DEFAULT NULL`, "loans.monthlyPayment");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.endDate");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`nextPaymentDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "loans.nextPaymentDate");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "loans.attachments");
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "loans.updatedAt");
  // loanType enum changed — add column if missing (existing enum rows stay as-is)
  await run(`ALTER TABLE \`loans\` ADD COLUMN \`loanType\` enum('mortgage','heloc','personal','construction','other') COLLATE utf8mb4_unicode_ci DEFAULT 'mortgage'`, "loans.loanType");

  // ── wishlistItems ───────────────────────────────────────────────────────────
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
  // Legacy wishlistItems had label/description/estimatedCost; add new schema columns.
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "wishlistItems.name");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "wishlistItems.ownerId");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "wishlistItems.propertyId");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`category\` enum('Furniture','Appliance','Electronics','Decor','Renovation','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "wishlistItems.category");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`estimatedPrice\` int DEFAULT NULL`, "wishlistItems.estimatedPrice");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`status\` enum('wanted','saved','purchased') COLLATE utf8mb4_unicode_ci DEFAULT 'wanted'`, "wishlistItems.status");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`url\` text COLLATE utf8mb4_unicode_ci`, "wishlistItems.url");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`attachments\` json DEFAULT NULL`, "wishlistItems.attachments");
  await run(`ALTER TABLE \`wishlistItems\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "wishlistItems.updatedAt");

  // ── purchaseCosts ───────────────────────────────────────────────────────────
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
  // Legacy purchaseCosts used `label`; add new schema columns.
  await run(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' FIRST`, "purchaseCosts.name");
  await run(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "purchaseCosts.ownerId");
  await run(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`propertyId\` int NOT NULL DEFAULT 1`, "purchaseCosts.propertyId");
  await run(`ALTER TABLE \`purchaseCosts\` ADD COLUMN \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`, "purchaseCosts.updatedAt");

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
  // Legacy calendarEvents had completely different columns (eventType, createdById, etc.)
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`ownerId\` int NOT NULL DEFAULT 1`, "calendarEvents.ownerId");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''`, "calendarEvents.title");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`description\` text COLLATE utf8mb4_unicode_ci`, "calendarEvents.description");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`endDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.endDate");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`category\` enum('Maintenance','Payment','Inspection','Renovation','Legal','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.category");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`isRecurring\` tinyint(1) DEFAULT '0'`, "calendarEvents.isRecurring");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`recurringInterval\` enum('monthly','quarterly','yearly') COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.recurringInterval");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`reminderDaysBefore\` int DEFAULT NULL`, "calendarEvents.reminderDaysBefore");
  await run(`ALTER TABLE \`calendarEvents\` ADD COLUMN \`externalCalendarId\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL`, "calendarEvents.externalCalendarId");

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

  console.log("Unified HomeVault migration complete.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
