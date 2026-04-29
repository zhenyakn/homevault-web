/**
 * apply-migration-v3.mjs
 *
 * Idempotent migration script — safe to run on any state:
 *   - Fresh database (creates everything)
 *   - Partially-migrated TiDB instance (skips what exists)
 *   - Already-complete database (all steps are no-ops)
 *
 * Fixes addressed vs earlier migration files:
 *   - Removes DEFAULT ('[]') on json columns (TiDB / MySQL 5.7 incompatible)
 *   - Creates all tables in dependency order (users first, then FK-dependent tables)
 *   - Seeds default property row so the app loads without manual setup
 */

import mysql from 'mysql2/promise';

const IGNORABLE = new Set([
  'ER_DUP_KEYNAME',
  'ER_FK_DUP_NAME',
  'ER_DUP_FIELDNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_ENTRY',
]);

async function exec(conn, sql, label) {
  try {
    await conn.execute(sql);
    console.log(`  ✓  ${label}`);
  } catch (e) {
    if (IGNORABLE.has(e.code)) {
      console.log(`  –  ${label} (already exists, skipped)`);
    } else {
      console.error(`  ✗  ${label}\n     ${e.code}: ${e.message}`);
      throw e;
    }
  }
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    console.error('  Set it in your .env file and run: node apply-migration-v3.mjs');
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  console.log('Connected. Running migration v3…\n');

  // ─── 1. users ───────────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\`           int          NOT NULL AUTO_INCREMENT,
      \`openId\`       varchar(64)  NOT NULL,
      \`name\`         text,
      \`email\`        varchar(320),
      \`loginMethod\`  varchar(64),
      \`role\`         enum('user','admin') NOT NULL DEFAULT 'user',
      \`createdAt\`    timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`    timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`lastSignedIn\` timestamp    NOT NULL DEFAULT (now()),
      CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
    )
  `, 'CREATE TABLE users');

  await exec(conn,
    `CREATE INDEX \`openId_idx\` ON \`users\` (\`openId\`)`,
    'IDX users.openId'
  );

  // ─── 2. properties ──────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`properties\` (
      \`id\`                  int          NOT NULL DEFAULT 1,
      \`houseName\`           varchar(200)          DEFAULT 'My Home',
      \`houseNickname\`       varchar(200),
      \`address\`             text,
      \`latitude\`            decimal(10,8),
      \`longitude\`           decimal(11,8),
      \`purchaseDate\`        varchar(20),
      \`purchasePrice\`       int,
      \`squareMeters\`        int,
      \`rooms\`               int,
      \`yearBuilt\`           int,
      \`floor\`               int,
      \`parkingSpots\`        int,
      \`hasStorage\`          boolean               DEFAULT false,
      \`currency\`            varchar(10)           DEFAULT '₪',
      \`currencyCode\`        varchar(10)           DEFAULT 'ILS',
      \`timezone\`            varchar(50)           DEFAULT 'Asia/Jerusalem',
      \`startOfWeek\`         varchar(20)           DEFAULT 'Sunday',
      \`reminderDaysBefore\`  int                   DEFAULT 3,
      \`calendarSyncEnabled\` boolean               DEFAULT false,
      \`mapsProvider\`        varchar(20)           DEFAULT 'google',
      \`createdAt\`           timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`           timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`properties_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE properties');

  // Seed single property row — app expects id=1 to always exist
  await exec(conn,
    `INSERT IGNORE INTO \`properties\` (\`id\`) VALUES (1)`,
    'Seed default property row (id=1)'
  );

  // ─── 3. calendarEvents ──────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`calendarEvents\` (
      \`id\`               varchar(36)  NOT NULL,
      \`title\`            varchar(200) NOT NULL,
      \`date\`             varchar(20)  NOT NULL,
      \`time\`             varchar(20),
      \`eventType\`        enum('Expense','Repair','Upgrade','Loan','Other') NOT NULL,
      \`createdById\`      int          NOT NULL,
      \`linkedEntityId\`   varchar(36),
      \`linkedEntityType\` enum('Expense','Repair','Upgrade','Loan','PurchaseCost'),
      \`synced\`           boolean               DEFAULT false,
      \`notes\`            text,
      \`createdAt\`        timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`        timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`calendarEvents_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE calendarEvents');

  // ─── 4. expenses ────────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`expenses\` (
      \`id\`                 varchar(36)  NOT NULL,
      \`label\`              varchar(200) NOT NULL,
      \`amount\`             int          NOT NULL,
      \`date\`               varchar(20)  NOT NULL,
      \`category\`           enum('Mortgage','Utility','Insurance','Tax','Maintenance','Other') NOT NULL,
      \`ownerId\`            int          NOT NULL,
      \`isRecurring\`        boolean               DEFAULT false,
      \`recurringFrequency\` enum('Monthly','Quarterly','Annual'),
      \`isPaid\`             boolean               DEFAULT false,
      \`paidDate\`           varchar(20),
      \`attachments\`        json,
      \`notes\`              text,
      \`calendarEventId\`    varchar(36),
      \`createdAt\`          timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`          timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`expenses_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE expenses');

  // ─── 5. loans ───────────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`loans\` (
      \`id\`              varchar(36)  NOT NULL,
      \`lender\`          varchar(200) NOT NULL,
      \`totalAmount\`     int          NOT NULL,
      \`loanType\`        enum('Family','Bank','Friend','Other') NOT NULL,
      \`interestRate\`    decimal(5,2)          DEFAULT 0,
      \`startDate\`       varchar(20)  NOT NULL,
      \`dueDate\`         varchar(20),
      \`ownerId\`         int          NOT NULL,
      \`repayments\`      json,
      \`notes\`           text,
      \`calendarEventId\` varchar(36),
      \`createdAt\`       timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`       timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`loans_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE loans');

  // ─── 6. purchaseCosts ───────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`purchaseCosts\` (
      \`id\`              varchar(36)  NOT NULL,
      \`label\`           varchar(200) NOT NULL,
      \`amount\`          int          NOT NULL,
      \`date\`            varchar(20)  NOT NULL,
      \`category\`        varchar(100),
      \`ownerId\`         int          NOT NULL,
      \`attachments\`     json,
      \`notes\`           text,
      \`calendarEventId\` varchar(36),
      \`createdAt\`       timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`       timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`purchaseCosts_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE purchaseCosts');

  // ─── 7. repairs ─────────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`repairs\` (
      \`id\`              varchar(36)  NOT NULL,
      \`label\`           varchar(200) NOT NULL,
      \`description\`     text,
      \`priority\`        enum('Low','Medium','High','Critical') NOT NULL,
      \`status\`          enum('Pending','In Progress','Resolved') NOT NULL,
      \`dateLogged\`      varchar(20)  NOT NULL,
      \`contractor\`      varchar(200),
      \`contractorPhone\` varchar(20),
      \`estimatedCost\`   int,
      \`actualCost\`      int,
      \`ownerId\`         int          NOT NULL,
      \`attachments\`     json,
      \`notes\`           text,
      \`calendarEventId\` varchar(36),
      \`createdAt\`       timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`       timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`repairs_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE repairs');

  // ─── 8. upgrades ────────────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`upgrades\` (
      \`id\`              varchar(36)  NOT NULL,
      \`label\`           varchar(200) NOT NULL,
      \`description\`     text,
      \`status\`          enum('Planned','In Progress','Done') NOT NULL,
      \`budget\`          int          NOT NULL,
      \`spent\`           int                   DEFAULT 0,
      \`ownerId\`         int          NOT NULL,
      \`attachments\`     json,
      \`notes\`           text,
      \`calendarEventId\` varchar(36),
      \`createdAt\`       timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`       timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`upgrades_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE upgrades');

  // ─── 9. wishlistItems ───────────────────────────────────────────────────────
  await exec(conn, `
    CREATE TABLE IF NOT EXISTS \`wishlistItems\` (
      \`id\`            varchar(36)  NOT NULL,
      \`label\`         varchar(200) NOT NULL,
      \`description\`   text,
      \`estimatedCost\` int          NOT NULL,
      \`priority\`      enum('Low','Medium','High') NOT NULL,
      \`ownerId\`       int          NOT NULL,
      \`createdAt\`     timestamp    NOT NULL DEFAULT (now()),
      \`updatedAt\`     timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`wishlistItems_id\` PRIMARY KEY(\`id\`)
    )
  `, 'CREATE TABLE wishlistItems');

  // ─── 10. Foreign keys ───────────────────────────────────────────────────────
  const fks = [
    [`ALTER TABLE \`calendarEvents\` ADD CONSTRAINT \`calendarEvents_createdById_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK calendarEvents→users'],
    [`ALTER TABLE \`expenses\`       ADD CONSTRAINT \`expenses_ownerId_fk\`           FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK expenses→users'],
    [`ALTER TABLE \`loans\`          ADD CONSTRAINT \`loans_ownerId_fk\`              FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK loans→users'],
    [`ALTER TABLE \`purchaseCosts\`  ADD CONSTRAINT \`purchaseCosts_ownerId_fk\`      FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK purchaseCosts→users'],
    [`ALTER TABLE \`repairs\`        ADD CONSTRAINT \`repairs_ownerId_fk\`            FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK repairs→users'],
    [`ALTER TABLE \`upgrades\`       ADD CONSTRAINT \`upgrades_ownerId_fk\`           FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK upgrades→users'],
    [`ALTER TABLE \`wishlistItems\`  ADD CONSTRAINT \`wishlistItems_ownerId_fk\`      FOREIGN KEY (\`ownerId\`)     REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION`, 'FK wishlistItems→users'],
  ];
  for (const [sql, label] of fks) await exec(conn, sql, label);

  // ─── 11. Indexes ────────────────────────────────────────────────────────────
  const indexes = [
    [`CREATE INDEX \`calendar_date_idx\`      ON \`calendarEvents\` (\`date\`)`,        'IDX calendarEvents.date'],
    [`CREATE INDEX \`calendar_created_by_idx\` ON \`calendarEvents\` (\`createdById\`)`, 'IDX calendarEvents.createdById'],
    [`CREATE INDEX \`expense_date_idx\`        ON \`expenses\`       (\`date\`)`,         'IDX expenses.date'],
    [`CREATE INDEX \`expense_owner_idx\`       ON \`expenses\`       (\`ownerId\`)`,      'IDX expenses.ownerId'],
    [`CREATE INDEX \`expense_category_idx\`    ON \`expenses\`       (\`category\`)`,     'IDX expenses.category'],
    [`CREATE INDEX \`loan_owner_idx\`          ON \`loans\`          (\`ownerId\`)`,      'IDX loans.ownerId'],
    [`CREATE INDEX \`purchase_cost_date_idx\`  ON \`purchaseCosts\`  (\`date\`)`,         'IDX purchaseCosts.date'],
    [`CREATE INDEX \`purchase_cost_owner_idx\` ON \`purchaseCosts\`  (\`ownerId\`)`,      'IDX purchaseCosts.ownerId'],
    [`CREATE INDEX \`repair_status_idx\`       ON \`repairs\`        (\`status\`)`,       'IDX repairs.status'],
    [`CREATE INDEX \`repair_priority_idx\`     ON \`repairs\`        (\`priority\`)`,     'IDX repairs.priority'],
    [`CREATE INDEX \`repair_owner_idx\`        ON \`repairs\`        (\`ownerId\`)`,      'IDX repairs.ownerId'],
    [`CREATE INDEX \`upgrade_status_idx\`      ON \`upgrades\`       (\`status\`)`,       'IDX upgrades.status'],
    [`CREATE INDEX \`upgrade_owner_idx\`       ON \`upgrades\`       (\`ownerId\`)`,      'IDX upgrades.ownerId'],
    [`CREATE INDEX \`wishlist_priority_idx\`   ON \`wishlistItems\`  (\`priority\`)`,     'IDX wishlistItems.priority'],
    [`CREATE INDEX \`wishlist_owner_idx\`      ON \`wishlistItems\`  (\`ownerId\`)`,      'IDX wishlistItems.ownerId'],
  ];
  for (const [sql, label] of indexes) await exec(conn, sql, label);


  // ─── 13. Settings columns (added in v4) ──────────────────────────────────────
  const settingsCols = [
    [`ALTER TABLE \`properties\` ADD COLUMN \`propertyType\`   varchar(50)  DEFAULT 'Apartment'`, 'ADD properties.propertyType'],
    [`ALTER TABLE \`properties\` ADD COLUMN \`remindExpenses\` boolean      DEFAULT true`,        'ADD properties.remindExpenses'],
    [`ALTER TABLE \`properties\` ADD COLUMN \`remindLoans\`    boolean      DEFAULT true`,        'ADD properties.remindLoans'],
    [`ALTER TABLE \`properties\` ADD COLUMN \`remindRepairs\`  boolean      DEFAULT true`,        'ADD properties.remindRepairs'],
    [`ALTER TABLE \`properties\` ADD COLUMN \`remindCalendar\` boolean      DEFAULT true`,        'ADD properties.remindCalendar'],
  ];
  for (const [sql, label] of settingsCols) await exec(conn, sql, label);

  // ─── 12. Verify ─────────────────────────────────────────────────────────────
  console.log('\n── Verification ──────────────────────────────────────────────');
  const [tables] = await conn.execute('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]).join(', ');
  console.log('Tables:', tableNames);

  const expected = ['users','properties','expenses','loans','purchaseCosts','repairs','upgrades','wishlistItems','calendarEvents'];
  const missing = expected.filter(t => !tableNames.includes(t));
  if (missing.length) {
    console.error('MISSING tables:', missing.join(', '));
    process.exit(1);
  }

  await conn.end();
  console.log('\nMigration v3 complete ✓');
}

run().catch(e => { console.error(e); process.exit(1); });
