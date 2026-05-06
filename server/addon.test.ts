/**
 * Static-analysis tests: ensure the HA add-on migration script stays in sync
 * with drizzle/schema.ts, and that config.yaml + run.sh are internally consistent.
 *
 * These run without a database and complete in milliseconds. They catch the
 * class of bug where a column is added to schema.ts but never reflected in
 * apply-migration-addon.mjs — which would only surface after a Docker build
 * and a live deploy to Home Assistant.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

const schemaSrc    = readFileSync(resolve(ROOT, "drizzle/schema.ts"), "utf-8");
const migrationRaw = readFileSync(resolve(ROOT, "apply-migration-addon.mjs"), "utf-8");
const configYaml   = readFileSync(resolve(ROOT, "homevault-addon/config.yaml"), "utf-8");
const runSh        = readFileSync(resolve(ROOT, "homevault-addon/run.sh"), "utf-8");
const lockfile     = readFileSync(resolve(ROOT, "pnpm-lock.yaml"), "utf-8");

// Unescape template-literal backticks so SQL reads as plain SQL.
// In the .mjs source file: \`tableName\` → normalized: `tableName`
const migration = migrationRaw.replace(/\\`/g, "`");

// ── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Returns Map<tableName, Set<dbColumnName>> from drizzle/schema.ts.
 * Extracts column names from Drizzle type-function calls:
 *   varchar("colName", ...), int("colName"), boolean("colName"), etc.
 */
function parseSchemaColumns(src: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  // Find all mysqlTable("name", ...) positions to slice the file per table.
  const tableRx = /mysqlTable\(\s*"([^"]+)"/g;
  const positions: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tableRx.exec(src)) !== null) {
    positions.push({ name: m[1], start: m.index });
  }

  // Within each table's slice, extract DB column names from type-function calls.
  const colRx =
    /(?:varchar|int|text|boolean|timestamp|json|decimal|mysqlEnum)\(\s*"([^"]+)"/g;

  for (let i = 0; i < positions.length; i++) {
    const { name, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : src.length;
    const slice = src.slice(start, end);

    colRx.lastIndex = 0;
    const cols = new Set<string>();
    let cm: RegExpExecArray | null;
    while ((cm = colRx.exec(slice)) !== null) {
      cols.add(cm[1]);
    }
    result.set(name, cols);
  }

  return result;
}

/**
 * Returns Map<tableName, Set<dbColumnName>> from apply-migration-addon.mjs
 * (after backtick normalisation). Collects columns from:
 *   - CREATE TABLE IF NOT EXISTS `table` ( ... ) ENGINE=InnoDB
 *   - ALTER TABLE `table` ADD COLUMN `col`
 */
function parseMigrationColumns(src: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  let m: RegExpExecArray | null;

  // CREATE TABLE blocks
  const createRx =
    /CREATE TABLE IF NOT EXISTS `(\w+)`\s*\(([\s\S]*?)\) ENGINE=InnoDB/g;
  while ((m = createRx.exec(src)) !== null) {
    const tableName = m[1];
    const body = m[2];
    // Column definition lines: `colName` <sql-type> …
    // Excludes KEY / PRIMARY KEY / UNIQUE KEY lines which don't start with `
    const colDefRx =
      /^\s*`(\w+)`\s+(?:varchar|int|tinyint|text|timestamp|json|decimal|enum)/gm;
    const cols = new Set<string>();
    let cm: RegExpExecArray | null;
    while ((cm = colDefRx.exec(body)) !== null) {
      cols.add(cm[1]);
    }
    result.set(tableName, cols);
  }

  // ALTER TABLE … ADD COLUMN statements (convergence section)
  const alterRx = /ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/g;
  while ((m = alterRx.exec(src)) !== null) {
    const tableName = m[1];
    const colName = m[2];
    if (!result.has(tableName)) result.set(tableName, new Set());
    result.get(tableName)!.add(colName);
  }

  return result;
}

// Materialise once; all describe blocks share these maps.
const schemaTables    = parseSchemaColumns(schemaSrc);
const migrationTables = parseMigrationColumns(migration);

// ── 1. Table coverage ────────────────────────────────────────────────────────

describe("addon migration — every schema table has a CREATE TABLE block", () => {
  for (const tableName of schemaTables.keys()) {
    it(tableName, () => {
      expect(
        migrationTables.has(tableName),
        `Table \`${tableName}\` exists in drizzle/schema.ts but has no CREATE TABLE in apply-migration-addon.mjs`
      ).toBe(true);
    });
  }
});

// ── 2. Column coverage ───────────────────────────────────────────────────────

describe("addon migration — every schema column is covered (CREATE TABLE or ALTER)", () => {
  for (const [tableName, schemaCols] of schemaTables) {
    const migrationCols = migrationTables.get(tableName) ?? new Set<string>();
    for (const col of schemaCols) {
      it(`${tableName}.${col}`, () => {
        expect(
          migrationCols.has(col),
          `Column \`${tableName}\`.\`${col}\` is defined in drizzle/schema.ts ` +
          `but is absent from apply-migration-addon.mjs (not in CREATE TABLE and no ALTER TABLE ADD COLUMN)`
        ).toBe(true);
      });
    }
  }
});

// ── 3. Dropped-column anti-regression guards ─────────────────────────────────

describe("addon migration — removed columns do not reappear", () => {
  it("upgrades CREATE TABLE does not include `phase` (dropped in 0009)", () => {
    const block =
      migration.match(/CREATE TABLE IF NOT EXISTS `upgrades`[\s\S]*?ENGINE=InnoDB/)?.[0] ?? "";
    // Only flag actual column definitions (type keyword follows the name), not index references
    expect(block).not.toMatch(/`phase`\s+\w/);
  });
});

// ── 4. config.yaml ↔ run.sh consistency ─────────────────────────────────────

describe("addon config — every config.yaml option is exported in run.sh", () => {
  // Extract option keys from the options: section (terminated by schema:)
  const optionsSection =
    configYaml.match(/\noptions:\n([\s\S]*?)\nschema:/)?.[1] ?? "";
  const optionKeys = [...optionsSection.matchAll(/^  (\w+):/gm)].map(m => m[1]);

  it("config.yaml options section parses at least one key (sanity)", () => {
    expect(optionKeys.length).toBeGreaterThan(0);
  });

  for (const key of optionKeys) {
    it(`run.sh exports ${key}`, () => {
      expect(
        runSh,
        `Option ${key} defined in config.yaml but not exported in run.sh`
      ).toContain(`export ${key}=`);
    });
  }
});

// ── 5. pnpm-lock sanity ──────────────────────────────────────────────────────

describe("addon build — pnpm-lock.yaml includes required runtime packages", () => {
  const required = ["pino", "pino-pretty", "express-rate-limit"];
  for (const pkg of required) {
    it(pkg, () => {
      expect(
        lockfile,
        `${pkg} is missing from pnpm-lock.yaml — run 'pnpm add ${pkg}' and commit the lockfile`
      ).toContain(pkg);
    });
  }
});
