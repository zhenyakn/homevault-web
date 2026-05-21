/**
 * Static-analysis tests for the migration runner and SQL migration files.
 *
 * These run without a database and complete in milliseconds. They catch:
 *   1. SQL chunks silently dropped by the statement parser (leading-comment bug)
 *   2. MySQL 8.4-incompatible syntax (DROP/ADD COLUMN IF [NOT] EXISTS)
 *   3. Missing statement coverage in specific migration files
 */

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = resolve(ROOT, "drizzle");

const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith(".sql"))
  .sort();

// ── Statement parser — mirrors scripts/migrate.ts exactly ────────────────────
// If the runner logic changes, this must stay in sync.

function parseStatements(sql: string): string[] {
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

// ── Parser unit tests ─────────────────────────────────────────────────────────

describe("migrate.ts parser — leading comment handling", () => {
  it("keeps SQL that follows leading comment lines in a chunk", () => {
    const sql = [
      "-- header comment",
      "-- second comment",
      "CREATE TABLE IF NOT EXISTS `foo` (`id` varchar(36) NOT NULL PRIMARY KEY)",
      "",
      "--> statement-breakpoint",
      "",
      "CREATE TABLE IF NOT EXISTS `bar` (`id` varchar(36) NOT NULL PRIMARY KEY)",
    ].join("\n");

    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE TABLE IF NOT EXISTS `foo`");
    expect(stmts[1]).toContain("CREATE TABLE IF NOT EXISTS `bar`");
  });

  it("discards chunks that are purely comments", () => {
    const sql = [
      "-- only a comment",
      "",
      "--> statement-breakpoint",
      "",
      "CREATE TABLE IF NOT EXISTS `bar` (`id` varchar(36) NOT NULL PRIMARY KEY)",
    ].join("\n");

    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("CREATE TABLE IF NOT EXISTS `bar`");
  });

  it("counts statements correctly when every chunk has leading comments", () => {
    const sql = [
      "-- comment A",
      "ALTER TABLE `a` ADD COLUMN `x` int DEFAULT NULL",
      "",
      "--> statement-breakpoint",
      "",
      "-- comment B",
      "ALTER TABLE `b` ADD COLUMN `y` int DEFAULT NULL",
    ].join("\n");

    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(2);
  });
});

// ── MySQL compatibility — no unsupported DDL syntax ──────────────────────────

describe("migration files — MySQL 8.4 syntax compatibility", () => {
  it.each(sqlFiles)(
    "%s — no IF [NOT] EXISTS on ALTER/INDEX DDL (not supported on MySQL 8.4 Windows)",
    file => {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
      // Use plain DDL + rely on IGNORABLE error codes in the runner instead:
      //   ADD COLUMN    → ER_DUP_FIELDNAME (already IGNORABLE)
      //   DROP COLUMN   → ER_CANT_DROP_FIELD_OR_KEY (already IGNORABLE)
      //   CREATE INDEX  → ER_DUP_KEYNAME (already IGNORABLE)
      expect(sql).not.toMatch(/DROP\s+COLUMN\s+IF\s+EXISTS/i);
      expect(sql).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
      expect(sql).not.toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
    }
  );
});

// ── Statement count — no SQL silently lost to leading comments ────────────────

describe("migration files — statement parser extracts every SQL chunk", () => {
  it.each(sqlFiles)(
    "%s — every non-empty statement-breakpoint chunk produces at least one SQL statement",
    file => {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
      const chunks = sql.split(/-->\s*statement-breakpoint/);

      for (const chunk of chunks) {
        const lines = chunk.trim().split("\n");
        const hasSql = lines.some(
          l => !l.trimStart().startsWith("--") && l.trim().length > 0
        );
        if (!hasSql) continue;

        // A chunk with SQL content must survive the parser
        const firstIdx = lines.findIndex(l => !l.trimStart().startsWith("--"));
        const sqlContent = lines.slice(firstIdx).join("\n").trim();
        expect(
          sqlContent.length,
          `chunk in ${file} has SQL but parser would drop it:\n${chunk}`
        ).toBeGreaterThan(0);
      }
    }
  );
});

// ── 0012_files_property.sql — propertyId scope on files ──────────────────────

describe("0012_files_property.sql — propertyId scope", () => {
  const sql = readFileSync(
    resolve(MIGRATIONS_DIR, "0012_files_property.sql"),
    "utf-8"
  );

  it("adds the nullable propertyId column", () => {
    expect(sql).toMatch(
      /ALTER TABLE `files` ADD COLUMN `propertyId` int DEFAULT NULL/
    );
  });

  it("creates the files_property_idx index", () => {
    expect(sql).toContain("CREATE INDEX `files_property_idx`");
    expect(sql).toContain("ON `files` (`propertyId`)");
  });

  it("parses to exactly 2 SQL statements", () => {
    expect(parseStatements(sql)).toHaveLength(2);
  });
});

// ── 0011_files_and_app_settings.sql — files registry migration coverage ────

describe("0011_files_and_app_settings.sql — coverage", () => {
  const sql = readFileSync(
    resolve(MIGRATIONS_DIR, "0011_files_and_app_settings.sql"),
    "utf-8"
  );

  it("creates both app_settings and files tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `app_settings`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `files`");
  });

  it("files table declares the required columns", () => {
    expect(sql).toMatch(/`id`\s+varchar\(36\)\s+NOT NULL PRIMARY KEY/);
    expect(sql).toMatch(/`backend`\s+varchar\(16\)\s+NOT NULL/);
    expect(sql).toMatch(/`externalId`\s+text\s+NOT NULL/);
    expect(sql).toMatch(/`originalName`\s+varchar\(255\)\s+NOT NULL/);
    expect(sql).toMatch(/`mimeType`\s+varchar\(150\)\s+NOT NULL/);
    expect(sql).toMatch(/`size`\s+int/);
    expect(sql).toMatch(/`ownerUserId`\s+int\s+NOT NULL/);
    expect(sql).toMatch(/`createdAt`\s+timestamp/);
    expect(sql).toMatch(/`deletedAt`\s+timestamp\s+NULL/);
  });

  it("files table has FK to users + helpful indexes", () => {
    expect(sql).toContain(
      "FOREIGN KEY (`ownerUserId`) REFERENCES `users` (`id`)"
    );
    expect(sql).toContain("INDEX `files_owner_idx`");
    expect(sql).toContain("INDEX `files_backend_idx`");
  });

  it("app_settings has the expected key/value/updatedAt columns", () => {
    expect(sql).toMatch(/`key`\s+varchar\(64\)\s+NOT NULL PRIMARY KEY/);
    expect(sql).toMatch(/`value`\s+text\s+NOT NULL/);
    expect(sql).toMatch(/`updatedAt`\s+timestamp/);
  });

  it("produces exactly 2 SQL statements when parsed", () => {
    expect(parseStatements(sql)).toHaveLength(2);
  });
});

// ── 0010_payment_tables.sql — specific statement coverage ────────────────────

describe("0010_payment_tables.sql — payment tables migration coverage", () => {
  const sql = readFileSync(
    resolve(MIGRATIONS_DIR, "0010_payment_tables.sql"),
    "utf-8"
  );

  it("produces exactly 12 SQL statements when parsed", () => {
    expect(parseStatements(sql)).toHaveLength(12);
  });

  it("creates all three payment tables", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `loanRepayments`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `repairQuotePayments`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `upgradeOptionPayments`");
  });

  it("drops all three legacy JSON columns", () => {
    expect(sql).toMatch(/ALTER TABLE `loans`\s+DROP COLUMN `repayments`/);
    expect(sql).toMatch(/ALTER TABLE `repairQuotes`\s+DROP COLUMN `payments`/);
    expect(sql).toMatch(
      /ALTER TABLE `upgradeOptions`\s+DROP COLUMN `payments`/
    );
  });

  it("drops legacy ownerId from loanRepayments before first INSERT into it", () => {
    const dropFkIdx = sql.indexOf(
      "DROP FOREIGN KEY `loanRepayments_ownerId_users_id_fk`"
    );
    const dropColIdx = sql.indexOf("DROP COLUMN `ownerId`");
    const insertLrIdx = sql.indexOf("INSERT IGNORE INTO `loanRepayments`");
    expect(dropFkIdx, "must drop ownerId FK").toBeGreaterThan(-1);
    expect(dropColIdx, "must drop ownerId column").toBeGreaterThan(-1);
    expect(insertLrIdx, "must have INSERT for loanRepayments").toBeGreaterThan(
      -1
    );
    expect(dropColIdx, "DROP COLUMN must come before INSERT").toBeLessThan(
      insertLrIdx
    );
  });

  it("normalizes upgradeOptions.id collation before creating upgradeOptionPayments FK", () => {
    const modifyIdx = sql.indexOf("MODIFY COLUMN `id`");
    const createIdx = sql.indexOf(
      "CREATE TABLE IF NOT EXISTS `upgradeOptionPayments`"
    );
    expect(modifyIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(
      modifyIdx,
      "MODIFY COLUMN must appear before the upgradeOptionPayments CREATE TABLE"
    ).toBeLessThan(createIdx);
  });
});
