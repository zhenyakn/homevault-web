/**
 * Migration v5: Upgrade sub-entities
 * - upgrades: add `phase` column
 * - upgradeOptions: new table (vendor quotes per upgrade)
 * - upgradeItems: new table (individual products/tasks per upgrade)
 * Safe to re-run (IF NOT EXISTS / column-exists checks).
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

const run = async (sql, label) => {
  try {
    await conn.execute(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.message?.includes("Duplicate column")) {
      console.log(`- ${label} (already applied)`);
    } else {
      throw e;
    }
  }
};

await run(
  `ALTER TABLE \`upgrades\` ADD COLUMN phase ENUM('Planning','Sourcing','Building','Done') NOT NULL DEFAULT 'Planning'`,
  "upgrades.phase"
);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`upgradeOptions\` (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    upgradeId   VARCHAR(36)  NOT NULL,
    name        VARCHAR(200) NOT NULL,
    vendorPhone VARCHAR(30),
    totalPrice  INT,
    timeline    VARCHAR(100),
    warranty    VARCHAR(100),
    scope       TEXT,
    isSelected  BOOLEAN      NOT NULL DEFAULT FALSE,
    notes       TEXT,
    payments    JSON,
    createdAt   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updatedAt   TIMESTAMP    NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_upgradeOptions_upgradeId (upgradeId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log("✓ upgradeOptions table");

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`upgradeItems\` (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    upgradeId     VARCHAR(36)  NOT NULL,
    propertyId    INT          NOT NULL DEFAULT 1,
    ownerId       INT          NOT NULL,
    name          VARCHAR(200) NOT NULL,
    vendorName    VARCHAR(200),
    estimatedCost INT,
    actualCost    INT,
    status        ENUM('Need to find','Researching','Quoted','Ordered','Delivered','Installed') NOT NULL DEFAULT 'Need to find',
    eta           VARCHAR(20),
    notes         TEXT,
    createdAt     TIMESTAMP    NOT NULL DEFAULT NOW(),
    updatedAt     TIMESTAMP    NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_upgradeItems_upgradeId (upgradeId),
    INDEX idx_upgradeItems_propertyId (propertyId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
console.log("✓ upgradeItems table");

await conn.end();
console.log("\nMigration v5 complete.");
