import { test, expect } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Cross-cutting edge cases & error paths — the "what if the user does something
 * odd" checks that complement the happy-path CRUD flows: cancelling a dialog,
 * decimal/odd inputs, special characters, and empty-search states. Everything is
 * sandbox-named so teardown cleans up regardless of outcome.
 */
test.describe("Edge cases — dialogs, odd inputs & empty states", () => {
  test("Escape closes the create dialog without creating a record", async ({
    expenses,
    app,
    sandbox,
  }) => {
    await expenses.open();
    const name = sandbox.name("Phantom");
    await app.clickButton(/Add expense/i);
    await app.expectDialogOpen();
    await app
      .dialog()
      .getByLabel(/Description/i)
      .first()
      .fill(name);
    await app.closeDialog();
    await app.expectDialogOpen(false);
    // Dialog was abandoned — nothing should have been persisted.
    await expenses.expectNoRow(name);
  });

  test("decimal amounts round-trip through create", async ({
    expenses,
    sandbox,
  }) => {
    await expenses.open();
    const name = sandbox.name("Decimal");
    await expenses.addExpense({ ...factories.expense(name), amount: "12.34" });
    await expenses.expectRow(name);
    await expenses.deleteExpense(name);
    await expenses.expectNoRow(name);
  });

  test("special characters in a name are preserved and cleaned up", async ({
    expenses,
    sandbox,
  }) => {
    await expenses.open();
    const name = `${sandbox.name("Quote")} <O'Brien> & "Co."`;
    await expenses.addExpense(factories.expense(name));
    await expenses.expectRow(name);
  });

  test("a very long name still renders in the list", async ({
    expenses,
    sandbox,
  }) => {
    await expenses.open();
    const name = sandbox.name("Long" + "g".repeat(120));
    await expenses.addExpense(factories.expense(name));
    await expenses.expectRow(sandbox.prefix);
  });

  test("inventory search for a non-existent term yields no matching row", async ({
    inventory,
    sandbox,
  }) => {
    await inventory.open();
    const name = sandbox.name("Widget");
    await inventory.addItem(factories.inventory(name));
    await inventory.expectRow(name);

    // A query that can't match our item should hide it.
    await inventory.search("zzz-no-such-item-9999");
    await expect(inventory.app.page.getByText(name)).toHaveCount(0);
  });
});
