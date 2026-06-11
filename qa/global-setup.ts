import type { FullConfig } from "@playwright/test";
import { seedDemoData, waitForServer, saveSeedState } from "./support/app";

/**
 * Runs once before the whole suite: wait for the dev server (launched by the
 * `webServer` config) to be ready, seed the demo property, and persist its id
 * for the per-test fixtures.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:5000";

  console.log(`[qa] waiting for server at ${baseURL} …`);
  await waitForServer(baseURL);

  console.log("[qa] seeding demo data (data.seedMock) …");
  const propertyId = await seedDemoData(baseURL);
  saveSeedState(propertyId);
  console.log(`[qa] seeded demo property id=${propertyId}`);
}
