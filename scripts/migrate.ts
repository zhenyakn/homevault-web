/**
 * scripts/migrate.ts
 *
 * Minimal raw-SQL migration runner.
 * Reads every *.sql file in drizzle/ in lexicographic order,
 * splits on `--> statement-breakpoint`, and executes each statement
 * sequentially. Skips files that have already been recorded in the
 * `_migrations` table.
 *
 * Usage:  pnpm run db:migrate
 */

import fs   from "fs";
import path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is not set in .env");

const MIGRATIONS_DIR = path.resolve("drizzle");

// MySQL error codes that mean "already exists" or "incompatible but pre-existing"
// — safe to ignore for idempotency
const IGNORABLE = new Set([
  "ER_DUP_FIELDNAME",           // column already exists
  "ER_TABLE_EXISTS_ERROR",      // table already exists
  "ER_DUP_KEYNAME",             // index already exists
  "ER_FK_DUP_NAME",             // FK constraint name already exists
  "ER_CANT_DROP_FIELD_OR_KEY",  // dropping index/column that doesn't exist
  "ER_FK_INCOMPATIBLE_COLUMNS", // FK already exists with correct definition
  "ER_DUP_CONSTRAINT_NAME",     // constraint name already taken (MySQL 8.0+)
]);

async function run() {
  const conn = await mysql.createConnection(DB_URL!);

  // Ensure tracking table exists
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      appliedAt  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Already-applied filenames
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    "SELECT filename FROM _migrations"
  );
  const applied = new Set(rows.map((r: any) => r.filename));

  // Collect .sql files sorted lexicographically
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[skip]  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = sql
      .split(/-->\s*statement-breakpoint/)
      .flatMap(chunk => chunk.split(/;(?=\s*(\n|$))/))
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    console.log(`[run]   ${file} (${statements.length} statements)`);

    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
      } catch (err: any) {
        if (IGNORABLE.has(err.code)) {
          console.log(`  [ok, already exists] ${stmt.slice(0, 60)}...`);
        } else {
          console.error(`  [FAILED] ${stmt.slice(0, 120)}`);
          console.error(`  Error (${err.code}): ${err.message}`);
          await conn.end();
          process.exit(1);
        }
      }
    }

    await conn.execute(
      "INSERT INTO _migrations (filename) VALUES (?)",
      [file]
    );
    console.log(`  [done]`);
  }

  await conn.end();
  console.log("\nAll migrations applied.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
