// Moved from repo root — see scripts/migrations/README.md for context.
// Original content preserved verbatim below.

import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const connection = await mysql.createConnection(process.env.DATABASE_URL);

console.log("Applying migration...");

const sql = readFileSync(join(__dirname, "../../drizzle/migrations/0000_initial.sql"), "utf8");
const statements = sql.split(";").map(s => s.trim()).filter(Boolean);

for (const stmt of statements) {
  try {
    await connection.execute(stmt);
    console.log("  OK:", stmt.slice(0, 60));
  } catch (err) {
    console.error("  FAIL:", stmt.slice(0, 60));
    console.error(err.message);
  }
}

await connection.end();
console.log("Done.");
