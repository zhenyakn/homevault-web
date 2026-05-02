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

  // ── properties ──────────────────────────────────────────────────────────────
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
    "seed default property row"
  );

  // ── calendarEvents ──────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`calendarEvents\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`time\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`eventType\` enum('Expense','Repair','Upgrade','Loan','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`createdById\` int NOT NULL,
      \`linkedEntityId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`linkedEntityType\` enum('Expense','Repair','Upgrade','Loan','PurchaseCost') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`synced\` tinyint(1) DEFAULT '0',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`),
      KEY \`calendar_date_idx\` (\`date\`),
      KEY \`calendar_created_by_idx\` (\`createdById\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "calendarEvents"
  );

  await run(
    `ALTER TABLE \`calendarEvents\`
       ADD CONSTRAINT \`calendarEvents_createdById_users_id_fk\`
       FOREIGN KEY (\`createdById\`) REFERENCES \`users\`(\`id\`)`,
    "FK calendarEvents.createdById → users.id"
  );

  // Legacy upgrade: ensure propertyId exists on older calendarEvents tables
  await run(
    "ALTER TABLE `calendarEvents` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "calendarEvents.propertyId"
  );

  // ── expenses ────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`expenses\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`label\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`category\` enum('Mortgage','Utility','Insurance','Tax','Maintenance','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`ownerId\` int NOT NULL,
      \`isRecurring\` tinyint(1) DEFAULT '0',
      \`recurringFrequency\` enum('Monthly','Quarterly','Annual') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`isPaid\` tinyint(1) DEFAULT '0',
      \`paidDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`attachments\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`calendarEventId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`),
      KEY \`expense_date_idx\` (\`date\`),
      KEY \`expense_owner_idx\` (\`ownerId\`),
      KEY \`expense_category_idx\` (\`category\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "expenses"
  );

  await run(
    `ALTER TABLE \`expenses\`
       ADD CONSTRAINT \`expenses_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK expenses.ownerId → users.id"
  );

  // Legacy upgrade: ensure propertyId exists on older expenses tables
  await run(
    "ALTER TABLE `expenses` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "expenses.propertyId"
  );

  // ── loans ───────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`loans\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`lender\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`totalAmount\` int NOT NULL,
      \`loanType\` enum('Family','Bank','Friend','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`interestRate\` decimal(5,2) DEFAULT '0.00',
      \`startDate\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`dueDate\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`ownerId\` int NOT NULL,
      \`repayments\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`calendarEventId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`),
      KEY \`loan_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "loans"
  );

  await run(
    `ALTER TABLE \`loans\`
       ADD CONSTRAINT \`loans_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK loans.ownerId → users.id"
  );

  // Legacy upgrade: ensure propertyId exists on older loans tables
  await run(
    "ALTER TABLE `loans` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "loans.propertyId"
  );

  // ── purchaseCosts ───────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`purchaseCosts\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`label\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`category\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`ownerId\` int NOT NULL,
      \`attachments\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`calendarEventId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`),
      KEY \`purchase_cost_date_idx\` (\`date\`),
      KEY \`purchase_cost_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "purchaseCosts"
  );

  await run(
    `ALTER TABLE \`purchaseCosts\`
       ADD CONSTRAINT \`purchaseCosts_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK purchaseCosts.ownerId → users.id"
  );

  // Legacy upgrade: ensure propertyId exists on older purchaseCosts tables
  await run(
    "ALTER TABLE `purchaseCosts` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "purchaseCosts.propertyId"
  );

  // ── repairs ─────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`repairs\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`label\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`priority\` enum('Low','Medium','High','Critical') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`status\` enum('Pending','In Progress','Resolved') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`dateLogged\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`contractor\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`contractorPhone\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`estimatedCost\` int DEFAULT NULL,
      \`actualCost\` int DEFAULT NULL,
      \`ownerId\` int NOT NULL,
      \`attachments\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`calendarEventId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      \`phase\` enum('Assessment','Quoting','Scheduled','In Progress','Resolved') COLLATE utf8mb4_unicode_ci DEFAULT 'Assessment',
      PRIMARY KEY (\`id\`),
      KEY \`repair_status_idx\` (\`status\`),
      KEY \`repair_priority_idx\` (\`priority\`),
      KEY \`repair_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "repairs"
  );

  await run(
    `ALTER TABLE \`repairs\`
       ADD CONSTRAINT \`repairs_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK repairs.ownerId → users.id"
  );

  // Legacy upgrade: ensure propertyId and phase exist on older repairs tables
  await run(
    "ALTER TABLE `repairs` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "repairs.propertyId"
  );
  await run(
    "ALTER TABLE `repairs` ADD COLUMN `phase` enum('Assessment','Quoting','Scheduled','In Progress','Resolved') DEFAULT 'Assessment'",
    "repairs.phase"
  );

  // ── upgrades ────────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgrades\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`label\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`status\` enum('Planned','In Progress','Done') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`budget\` int NOT NULL,
      \`spent\` int DEFAULT '0',
      \`ownerId\` int NOT NULL,
      \`attachments\` json DEFAULT NULL,
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`calendarEventId\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      \`phase\` enum('Planning','Sourcing','Building','Done') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Planning',
      PRIMARY KEY (\`id\`),
      KEY \`upgrade_status_idx\` (\`status\`),
      KEY \`upgrade_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgrades"
  );

  await run(
    `ALTER TABLE \`upgrades\`
       ADD CONSTRAINT \`upgrades_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK upgrades.ownerId → users.id"
  );

  // Legacy upgrade: ensure propertyId and phase exist on older upgrades tables
  await run(
    "ALTER TABLE `upgrades` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "upgrades.propertyId"
  );
  await run(
    "ALTER TABLE `upgrades` ADD COLUMN `phase` enum('Planning','Sourcing','Building','Done') NOT NULL DEFAULT 'Planning'",
    "upgrades.phase"
  );

  // ── wishlistItems ───────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`wishlistItems\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`label\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`description\` text COLLATE utf8mb4_unicode_ci,
      \`estimatedCost\` int NOT NULL,
      \`priority\` enum('Low','Medium','High') COLLATE utf8mb4_unicode_ci NOT NULL,
      \`ownerId\` int NOT NULL,
      \`attachments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`propertyId\` int NOT NULL DEFAULT '1',
      PRIMARY KEY (\`id\`),
      KEY \`wishlist_priority_idx\` (\`priority\`),
      KEY \`wishlist_owner_idx\` (\`ownerId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "wishlistItems"
  );

  await run(
    `ALTER TABLE \`wishlistItems\`
       ADD CONSTRAINT \`wishlistItems_ownerId_users_id_fk\`
       FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`)`,
    "FK wishlistItems.ownerId → users.id"
  );

  // Legacy upgrades: ensure propertyId and attachments exist on older wishlistItems tables
  await run(
    "ALTER TABLE `wishlistItems` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "wishlistItems.propertyId"
  );
  await run(
    "ALTER TABLE `wishlistItems` ADD COLUMN `attachments` json DEFAULT NULL",
    "wishlistItems.attachments"
  );

  // ── repairQuotes ────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`repairQuotes\` (
      \`id\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`repairId\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`contractorName\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
      \`contractorPhone\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`quotedPrice\` int DEFAULT NULL,
      \`timeline\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`guarantee\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
      \`scope\` text COLLATE utf8mb4_unicode_ci,
      \`isSelected\` tinyint(1) NOT NULL DEFAULT '0',
      \`notes\` text COLLATE utf8mb4_unicode_ci,
      \`payments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`repairQuote_repairId_idx\` (\`repairId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "repairQuotes"
  );

  // ── upgradeOptions ──────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgradeOptions\` (
      \`id\` varchar(36) NOT NULL,
      \`upgradeId\` varchar(36) NOT NULL,
      \`name\` varchar(200) NOT NULL,
      \`vendorPhone\` varchar(30) DEFAULT NULL,
      \`totalPrice\` int DEFAULT NULL,
      \`timeline\` varchar(100) DEFAULT NULL,
      \`warranty\` varchar(100) DEFAULT NULL,
      \`scope\` text,
      \`isSelected\` tinyint(1) NOT NULL DEFAULT '0',
      \`notes\` text,
      \`payments\` json DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_upgradeOptions_upgradeId\` (\`upgradeId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgradeOptions"
  );

  // ── upgradeItems ────────────────────────────────────────────────────────────
  await run(
    `CREATE TABLE IF NOT EXISTS \`upgradeItems\` (
      \`id\` varchar(36) NOT NULL,
      \`upgradeId\` varchar(36) NOT NULL,
      \`propertyId\` int NOT NULL DEFAULT '1',
      \`ownerId\` int NOT NULL,
      \`name\` varchar(200) NOT NULL,
      \`vendorName\` varchar(200) DEFAULT NULL,
      \`estimatedCost\` int DEFAULT NULL,
      \`actualCost\` int DEFAULT NULL,
      \`status\` enum('Need to find','Researching','Quoted','Ordered','Delivered','Installed') NOT NULL DEFAULT 'Need to find',
      \`eta\` varchar(20) DEFAULT NULL,
      \`notes\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_upgradeItems_upgradeId\` (\`upgradeId\`),
      KEY \`idx_upgradeItems_propertyId\` (\`propertyId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    "upgradeItems"
  );

  // Legacy upgrade: ensure propertyId exists on older upgradeItems tables
  await run(
    "ALTER TABLE `upgradeItems` ADD COLUMN `propertyId` int NOT NULL DEFAULT 1",
    "upgradeItems.propertyId"
  );

  console.log("Unified HomeVault migration complete.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
