/**
 * Migration v4: Multi-property support
 * - properties: add userId column, make id AUTO_INCREMENT
 * - all module tables: add propertyId column (DEFAULT 1 preserves existing data)
 * Safe to re-run (uses IF NOT EXISTS / MODIFY only when needed).
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
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_DUP_KEY" || e.message.includes("Duplicate column")) {
      console.log(`- ${label} (already applied)`);
    } else {
      throw e;
    }
  }
};

// properties: make id AUTO_INCREMENT and add userId
await run(
  `ALTER TABLE properties MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT`,
  "properties.id → AUTO_INCREMENT"
);
await run(
  `ALTER TABLE properties ADD COLUMN userId INT NOT NULL DEFAULT 1`,
  "properties.userId"
);

// Ensure the seed property row exists
await conn.execute(
  `INSERT IGNORE INTO properties (id, userId) VALUES (1, 1)`
);
console.log("✓ seed property row (id=1)");

// All module tables
const tables = ["expenses", "repairs", "upgrades", "loans", "wishlistItems", "purchaseCosts", "calendarEvents"];
for (const t of tables) {
  await run(
    `ALTER TABLE \`${t}\` ADD COLUMN propertyId INT NOT NULL DEFAULT 1`,
    `${t}.propertyId`
  );
}

await conn.end();
console.log("\nMigration v4 complete.");
