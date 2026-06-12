import type { FullConfig } from "@playwright/test";
import mysql from "mysql2/promise";
import { seedDemoData, waitForServer, saveSeedState } from "./support/app";

const DEFAULT_DB_URL = "mysql://homevault:password@127.0.0.1:3306/homevault";

/**
 * Reset the NO_AUTH user's language to English directly in the database, BEFORE
 * any tRPC request. The server caches the NO_AUTH user (incl. language) on the
 * first request for its whole lifetime (server/_core/context.ts), so the DB
 * value at first-request time fixes the UI language for the run. A previous RTL
 * run may have left it "he"; this guarantees the English baseline. (The RTL
 * project switches to Hebrew at runtime via the in-app control.)
 */
async function resetLanguageToEnglish(): Promise<void> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DB_URL;
  try {
    const conn = await mysql.createConnection(url);
    await conn.execute("UPDATE users SET language = 'en'");
    await conn.end();
  } catch {
    // Best-effort: on a fresh DB the table/user may not exist yet — the column
    // defaults to 'en' anyway, so the baseline still holds.
  }
}

/**
 * Runs once before the whole suite: force the English baseline, wait for the
 * dev server (launched by the `webServer` config), seed the demo property, and
 * persist its id for the per-test fixtures.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:5000";

  await resetLanguageToEnglish();

  console.log(`[qa] waiting for server at ${baseURL} …`);
  await waitForServer(baseURL);

  console.log("[qa] seeding demo data (data.seedMock) …");
  const propertyId = await seedDemoData(baseURL);
  saveSeedState(propertyId);
  console.log(`[qa] seeded demo property id=${propertyId}`);
}
