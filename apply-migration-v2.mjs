import mysql from 'mysql2/promise';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Tables that failed due to JSON DEFAULT ('[]') syntax - use NULL default instead
  const statements = [
    `CREATE TABLE IF NOT EXISTS \`expenses\` (
      \`id\` varchar(36) NOT NULL,
      \`label\` varchar(200) NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) NOT NULL,
      \`category\` enum('Mortgage','Utility','Insurance','Tax','Maintenance','Other') NOT NULL,
      \`ownerId\` int NOT NULL,
      \`isRecurring\` boolean DEFAULT false,
      \`recurringFrequency\` enum('Monthly','Quarterly','Annual'),
      \`isPaid\` boolean DEFAULT false,
      \`paidDate\` varchar(20),
      \`attachments\` json,
      \`notes\` text,
      \`calendarEventId\` varchar(36),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`expenses_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`loans\` (
      \`id\` varchar(36) NOT NULL,
      \`lender\` varchar(200) NOT NULL,
      \`totalAmount\` int NOT NULL,
      \`loanType\` enum('Family','Bank','Friend','Other') NOT NULL,
      \`interestRate\` decimal(5,2) DEFAULT 0,
      \`startDate\` varchar(20) NOT NULL,
      \`dueDate\` varchar(20),
      \`ownerId\` int NOT NULL,
      \`repayments\` json,
      \`notes\` text,
      \`calendarEventId\` varchar(36),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`loans_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`purchaseCosts\` (
      \`id\` varchar(36) NOT NULL,
      \`label\` varchar(200) NOT NULL,
      \`amount\` int NOT NULL,
      \`date\` varchar(20) NOT NULL,
      \`category\` varchar(100),
      \`ownerId\` int NOT NULL,
      \`attachments\` json,
      \`notes\` text,
      \`calendarEventId\` varchar(36),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`purchaseCosts_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`repairs\` (
      \`id\` varchar(36) NOT NULL,
      \`label\` varchar(200) NOT NULL,
      \`description\` text,
      \`priority\` enum('Low','Medium','High','Critical') NOT NULL,
      \`status\` enum('Pending','In Progress','Resolved') NOT NULL,
      \`dateLogged\` varchar(20) NOT NULL,
      \`contractor\` varchar(200),
      \`contractorPhone\` varchar(20),
      \`estimatedCost\` int,
      \`actualCost\` int,
      \`ownerId\` int NOT NULL,
      \`attachments\` json,
      \`notes\` text,
      \`calendarEventId\` varchar(36),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`repairs_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`upgrades\` (
      \`id\` varchar(36) NOT NULL,
      \`label\` varchar(200) NOT NULL,
      \`description\` text,
      \`status\` enum('Planned','In Progress','Done') NOT NULL,
      \`budget\` int NOT NULL,
      \`spent\` int DEFAULT 0,
      \`ownerId\` int NOT NULL,
      \`attachments\` json,
      \`notes\` text,
      \`calendarEventId\` varchar(36),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`upgrades_id\` PRIMARY KEY(\`id\`)
    )`,
    // Foreign keys for newly created tables
    `ALTER TABLE \`expenses\` ADD CONSTRAINT \`expenses_ownerId_users_id_fk\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
    `ALTER TABLE \`loans\` ADD CONSTRAINT \`loans_ownerId_users_id_fk\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
    `ALTER TABLE \`purchaseCosts\` ADD CONSTRAINT \`purchaseCosts_ownerId_users_id_fk\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
    `ALTER TABLE \`repairs\` ADD CONSTRAINT \`repairs_ownerId_users_id_fk\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
    `ALTER TABLE \`upgrades\` ADD CONSTRAINT \`upgrades_ownerId_users_id_fk\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
    // Indexes for newly created tables
    `CREATE INDEX \`expense_date_idx\` ON \`expenses\` (\`date\`)`,
    `CREATE INDEX \`expense_owner_idx\` ON \`expenses\` (\`ownerId\`)`,
    `CREATE INDEX \`expense_category_idx\` ON \`expenses\` (\`category\`)`,
    `CREATE INDEX \`loan_owner_idx\` ON \`loans\` (\`ownerId\`)`,
    `CREATE INDEX \`purchase_cost_date_idx\` ON \`purchaseCosts\` (\`date\`)`,
    `CREATE INDEX \`purchase_cost_owner_idx\` ON \`purchaseCosts\` (\`ownerId\`)`,
    `CREATE INDEX \`repair_status_idx\` ON \`repairs\` (\`status\`)`,
    `CREATE INDEX \`repair_priority_idx\` ON \`repairs\` (\`priority\`)`,
    `CREATE INDEX \`repair_owner_idx\` ON \`repairs\` (\`ownerId\`)`,
    `CREATE INDEX \`upgrade_status_idx\` ON \`upgrades\` (\`status\`)`,
    `CREATE INDEX \`upgrade_owner_idx\` ON \`upgrades\` (\`ownerId\`)`,
  ];

  for (const sql of statements) {
    try {
      await conn.execute(sql);
      console.log('OK:', sql.substring(0, 70) + '...');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_FK_DUP_NAME') {
        console.log('SKIP (already exists):', sql.substring(0, 70) + '...');
      } else {
        console.log('ERROR:', e.code, e.message.substring(0, 100));
      }
    }
  }

  // Verify all tables exist
  const [tables] = await conn.execute('SHOW TABLES');
  console.log('\nAll tables:', tables.map(t => Object.values(t)[0]).join(', '));
  
  // Verify expenses table
  try {
    const [cols] = await conn.execute('DESCRIBE expenses');
    console.log('Expenses columns:', cols.map(c => c.Field).join(', '));
  } catch(e) {
    console.log('ERROR verifying expenses:', e.message);
  }

  await conn.end();
  console.log('\nMigration v2 complete!');
}

run().catch(console.error);
