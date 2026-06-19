/**
 * Migration runner — converges the database to the current schema by running the
 * unified, idempotent `apply-migration-addon.mjs` script. That script is the
 * proven mechanism the Home Assistant add-on already uses on every boot, and a
 * static test (server/addon.test.ts) keeps it in sync with drizzle/schema.ts.
 *
 * We deliberately do NOT replay the historical drizzle/*.sql chain here: those
 * are a legacy upgrade path that isn't valid against a fresh MySQL (e.g. 0008
 * builds a case-insensitive-duplicate ENUM). The convergence script works for
 * both fresh and existing databases.
 *
 * Used two ways:
 *   - CLI:  `pnpm db:migrate` (scripts/migrate.ts delegates here)
 *   - Boot: called from server startup so deployments auto-migrate (index.ts)
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const execFileAsync = promisify(execFile);
const log = createLogger("migrate");

/** Locate apply-migration-addon.mjs across dev / bundled / Docker layouts. */
export function resolveAddonScript(): string {
  const candidates = [
    path.resolve(process.cwd(), "apply-migration-addon.mjs"),
    path.resolve(import.meta.dirname ?? ".", "../../apply-migration-addon.mjs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

type Log = (msg: string) => void;

/**
 * Apply the schema. Throws (script exits non-zero) so callers fail fast rather
 * than run against a half-migrated schema.
 */
export async function runMigrations(opts: { log?: Log } = {}): Promise<void> {
  const logFn = opts.log ?? ((m: string) => log.info(m));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const script = resolveAddonScript();
  if (!fs.existsSync(script)) {
    throw new Error(`[migrate] migration script not found at ${script}`);
  }

  logFn(`[migrate] converging schema via ${path.basename(script)}`);
  const { stdout, stderr } = await execFileAsync("node", [script], {
    env: process.env,
    cwd: path.dirname(script),
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
  if (out) logFn(out);
}
