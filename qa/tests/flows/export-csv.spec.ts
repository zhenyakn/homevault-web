import { test, expect } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * CSV export — every module exposes an "Export CSV" action that builds a file
 * client-side and triggers a browser download. We seed one sandbox-named record
 * per module first (so the list is non-empty and the export button is shown),
 * click it, and assert the resolved download has the module's filename prefix.
 *
 * The created records are sandbox-named, so teardown removes them automatically.
 */
test.describe("CSV export — per-module downloads", () => {
  /** Click the (only) "Export CSV" control and assert the download filename. */
  async function exportAndAssert(app: any, pattern: RegExp): Promise<void> {
    const download = app.page.waitForEvent("download", { timeout: 15_000 });
    await app.page
      .getByRole("button", { name: /Export CSV/i })
      .first()
      .click();
    expect((await download).suggestedFilename()).toMatch(pattern);
  }

  test("expenses → expenses_*.csv", async ({ expenses, app, sandbox }) => {
    await expenses.open();
    await expenses.addExpense(factories.expense(sandbox.name("Exp")));
    await exportAndAssert(app, /expenses_.*\.csv/);
  });

  test("loans → loans_*.csv", async ({ loans, app, sandbox }) => {
    await loans.open();
    await loans.addLoan(factories.loan(sandbox.name("Lender")));
    await exportAndAssert(app, /loans_.*\.csv/);
  });

  test("repairs → repairs_*.csv", async ({ repairs, app, sandbox }) => {
    await repairs.open();
    await repairs.logRepair(factories.repair(sandbox.name("Repair")));
    await exportAndAssert(app, /repairs_.*\.csv/);
  });

  test("upgrades → upgrades_*.csv", async ({ upgrades, app, sandbox }) => {
    await upgrades.open();
    await upgrades.createProject(factories.upgrade(sandbox.name("Upg")));
    await exportAndAssert(app, /upgrades_.*\.csv/);
  });

  test("inventory → inventory_*.csv", async ({ inventory, app, sandbox }) => {
    await inventory.open();
    await inventory.addItem(factories.inventory(sandbox.name("Item")));
    await exportAndAssert(app, /inventory_.*\.csv/);
  });

  test("wishlist → wishlist_*.csv", async ({ wishlist, app, sandbox }) => {
    await wishlist.open();
    await wishlist.addItem(factories.wishlist(sandbox.name("Wish")));
    await exportAndAssert(app, /wishlist_.*\.csv/);
  });

  test("purchase costs → purchase_costs_*.csv", async ({
    purchaseCosts,
    app,
    sandbox,
  }) => {
    await purchaseCosts.open();
    await purchaseCosts.addCost(factories.purchaseCost(sandbox.name("Cost")));
    await exportAndAssert(app, /purchase_costs_.*\.csv/);
  });
});
