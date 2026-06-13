import { test, expect } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Expenses filtering — the search box and category dropdown narrow the list.
 * We create one uniquely-named Utilities expense, then prove search and the
 * category filter each include/exclude it as expected. Sandbox-named, so
 * teardown cleans up.
 */
test.describe("Expenses — search & category filters", () => {
  test("search narrows to a matching row and hides non-matches", async ({
    expenses,
    sandbox,
  }) => {
    await expenses.open();
    const name = sandbox.name("Filterable");
    await expenses.addExpense(factories.expense(name)); // category: Utilities
    await expenses.expectRow(name);

    await expenses.search(sandbox.prefix);
    await expenses.expectRow(name);

    await expenses.search("zzz-no-match-9999");
    await expect(expenses.app.page.getByText(name)).toHaveCount(0);
  });

  test("category filter includes the matching category and excludes others", async ({
    expenses,
    sandbox,
  }) => {
    await expenses.open();
    const name = sandbox.name("Categorized");
    await expenses.addExpense(factories.expense(name)); // category: Utilities
    await expenses.expectRow(name);

    await expenses.filterCategory(/Utilities/i);
    await expenses.expectRow(name);

    await expenses.filterCategory(/Maintenance/i);
    await expect(expenses.app.page.getByText(name)).toHaveCount(0);
  });
});
