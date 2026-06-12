import { test as base, expect } from "@playwright/test";
import { Driver } from "./support/driver";
import { ACTIVE_PROPERTY_KEY, loadSeedState } from "./support/app";
import { cleanupByPrefix } from "./support/api";
import { shortId } from "./support/factories";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LoansPage } from "./pages/LoansPage";
import { RepairsPage } from "./pages/RepairsPage";
import { RepairDetailPage } from "./pages/RepairDetailPage";
import { UpgradesPage } from "./pages/UpgradesPage";
import { UpgradeDetailPage } from "./pages/UpgradeDetailPage";
import { InventoryPage } from "./pages/InventoryPage";
import { WishlistPage } from "./pages/WishlistPage";
import { PurchaseCostsPage } from "./pages/PurchaseCostsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { SettingsPage } from "./pages/SettingsPage";

const DEFAULT_BASE = "http://127.0.0.1:5000";

/**
 * Per-test data sandbox: a unique name prefix and guaranteed API-level teardown.
 * Self-cleaning tests create records named `sandbox.name(...)` and, whatever
 * happens, everything carrying this prefix is deleted afterwards — the seeded
 * demo data is never disturbed and re-runs stay green.
 */
export class Sandbox {
  readonly prefix = `QA-${shortId()}`;
  constructor(
    private readonly baseURL: string,
    private readonly propertyId: number,
  ) {}
  /** A unique, prefix-tagged name, e.g. sandbox.name("Loan") → "QA-x1y2 Loan". */
  name(label: string): string {
    return `${this.prefix} ${label}`;
  }
  async cleanup(): Promise<number> {
    return cleanupByPrefix(this.prefix, this.baseURL, this.propertyId);
  }
}

type Fixtures = {
  propertyId: number;
  app: Driver;
  sandbox: Sandbox;
  expenses: ExpensesPage;
  loans: LoansPage;
  repairs: RepairsPage;
  repairDetail: RepairDetailPage;
  upgrades: UpgradesPage;
  upgradeDetail: UpgradeDetailPage;
  inventory: InventoryPage;
  wishlist: WishlistPage;
  purchaseCosts: PurchaseCostsPage;
  calendar: CalendarPage;
  settings: SettingsPage;
};

export const test = base.extend<Fixtures>({
  propertyId: async ({}, use) => {
    await use(loadSeedState().propertyId);
  },

  app: async ({ page, baseURL, propertyId }, use) => {
    // Set the active property BEFORE the SPA boots. Language is English for all
    // projects (the server's cached NO_AUTH language; global-setup enforces the
    // English baseline). The RTL project switches to Hebrew at runtime via the
    // in-app control (see qa/tests/rtl/rtl-smoke.spec.ts).
    await page.addInitScript(
      ([propKey, id]) => window.localStorage.setItem(propKey, String(id)),
      [ACTIVE_PROPERTY_KEY, propertyId] as const,
    );
    await use(new Driver(page, baseURL ?? DEFAULT_BASE));
  },

  sandbox: async ({ baseURL, propertyId }, use) => {
    const sandbox = new Sandbox(baseURL ?? DEFAULT_BASE, propertyId);
    await use(sandbox);
    await sandbox.cleanup();
  },

  // Page objects — thin wrappers around the Driver, one per screen.
  expenses: async ({ app }, use) => use(new ExpensesPage(app)),
  loans: async ({ app }, use) => use(new LoansPage(app)),
  repairs: async ({ app }, use) => use(new RepairsPage(app)),
  repairDetail: async ({ app }, use) => use(new RepairDetailPage(app)),
  upgrades: async ({ app }, use) => use(new UpgradesPage(app)),
  upgradeDetail: async ({ app }, use) => use(new UpgradeDetailPage(app)),
  inventory: async ({ app }, use) => use(new InventoryPage(app)),
  wishlist: async ({ app }, use) => use(new WishlistPage(app)),
  purchaseCosts: async ({ app }, use) => use(new PurchaseCostsPage(app)),
  calendar: async ({ app }, use) => use(new CalendarPage(app)),
  settings: async ({ app }, use) => use(new SettingsPage(app)),
});

export { expect };
