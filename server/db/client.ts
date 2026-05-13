import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { ENV } from "../_core/env";

type Db = MySql2Database<Record<string, never>>;

let _db: Db | undefined;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (!ENV.databaseUrl) {
    throw new Error(
      "[Database] DATABASE_URL is not set. " +
        "Copy .env.example to .env and fill in your MySQL connection string."
    );
  }
  try {
    const pool = mysql.createPool({
      uri: ENV.databaseUrl,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
    });
    _db = drizzle(pool);
  } catch (error) {
    throw new Error(`[Database] Failed to connect: ${error}`);
  }
  return _db;
}

// MySQL returns JSON columns as raw strings via the mysql2 driver.
// Always run through this before calling array methods or returning to clients.
export function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value) ?? []; } catch { return []; }
  }
  return [];
}
