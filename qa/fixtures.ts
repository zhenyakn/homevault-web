import { test as base, expect } from "@playwright/test";
import { Driver } from "./support/driver";
import { ACTIVE_PROPERTY_KEY, loadSeedState } from "./support/app";

/**
 * Custom fixtures layered on Playwright Test.
 *
 *  - `propertyId`  the demo property seeded once in global-setup.
 *  - `app`         a ready-to-drive {@link Driver}. The active property is set
 *                  in localStorage *before* the SPA boots (via init script), so
 *                  the very first navigation already shows seeded data instead
 *                  of the empty default property.
 *
 * Usage:
 *   import { test, expect } from "../fixtures";
 *   test("…", async ({ app }) => { await app.goto("/expenses"); });
 */
type Fixtures = {
  propertyId: number;
  app: Driver;
};

export const test = base.extend<Fixtures>({
  propertyId: async ({}, use) => {
    await use(loadSeedState().propertyId);
  },

  app: async ({ page, baseURL, propertyId }, use) => {
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key, String(id)),
      [ACTIVE_PROPERTY_KEY, propertyId] as const,
    );
    await use(new Driver(page, baseURL ?? "http://127.0.0.1:5000"));
  },
});

export { expect };
