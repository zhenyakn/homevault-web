/**
 * Migration runner — applies every drizzle/*.sql file once, in order, tracked in
 * a `_migrations` table. Idempotent: "already exists" style errors are ignored.
 *
 * Used two ways:
 *   - CLI:  `pnpm db:migrate` (scripts/migrate.ts delegates here)
 *   - Boot: called from server startup so deployments auto-migrate (see index.ts)
 *
 * The statement parser mirrors the one asserted by server/migrate.test.ts.
 */

import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

// MySQL error codes meaning "already exists" — safe to ignore for idempotency.
const IGNORABLE = new Set([
  "ER_DUP_FIELDNAME", // column already exists
  "ER_TABLE_EXISTS_ERROR", // table already exists
  "ER_DUP_KEYNAME", // index already exists
  "ER_FK_DUP_NAME", // FK constraint name already exists
  "ER_CANT_DROP_FIELD_OR_KEY", // dropping index/column that doesn't exist
]);

/** Locate the drizzle/ SQL directory across dev / bundled / Docker layouts. */
export function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dirname ?? ".", "../../drizzle"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

/** Parse a .sql migration into individual statements (mirrors migrate.test.ts). */
export function parseStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint/)
    .flatMap(chunk => chunk.split(/;(?=\s*(\n|$))/))
    .map(s => {
      const lines = s.trim().split("\n");
      const firstSql = lines.findIndex(l => !l.trimStart().startsWith("--"));
      return firstSql === -1 ? "" : lines.slice(firstSql).join("\n").trim();
    })
    .filter(s => s.length > 0);
}

type Log = (msg: string) => void;

/**
 * Apply all pending migrations. Throws on a non-ignorable failure so callers
 * (boot, CLI) can fail fast rather than run against a half-migrated schema.
 */
export async function runMigrations(
  opts: { log?: Log } = {}
): Promise<{ applied: number; skipped: number }> {
  const log = opts.log ?? (m => console.log(m));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");

  const dir = resolveMigrationsDir();
  const conn = await mysql.createConnection(dbUrl);
  let applied = 0;
  let skipped = 0;

  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        appliedAt  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT filename FROM _migrations"
    );
    const done = new Set(rows.map(r => r.filename as string));

    const files = fs
      .readdirSync(dir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (done.has(file)) {
        skipped++;
        continue;
      }
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      const statements = parseStatements(sql);
      log(`[migrate] applying ${file} (${statements.length} statements)`);

      for (const stmt of statements) {
        try {
          await conn.execute(stmt);
        } catch (err: any) {
          if (IGNORABLE.has(err.code)) continue;
          throw new Error(
            `Migration ${file} failed (${err.code}): ${err.message}`
          );
        }
      }
      await conn.execute("INSERT INTO _migrations (filename) VALUES (?)", [
        file,
      ]);
      applied++;
    }
  } finally {
    await conn.end();
  }

  return { applied, skipped };
}
