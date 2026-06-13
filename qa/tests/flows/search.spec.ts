import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Global search modal — exercises every state of the ⌘K search:
 *  - opens from the header button and via the keyboard shortcut,
 *  - shows the "type at least 2 characters" hint below the threshold,
 *  - shows "no results" for a query that matches nothing,
 *  - returns a freshly-created, uniquely-named expense,
 *  - navigates to the result with the keyboard and closes on Escape.
 *
 * The created expense is sandbox-named so teardown removes it automatically.
 */
test.describe("Global search — states, results & keyboard", () => {
  test("min-chars hint, no-results and a real match", async ({
    app,
    search,
    expenses,
    sandbox,
  }) => {
    // Seed a uniquely-named expense so the search has a guaranteed hit.
    const name = sandbox.name("Searchable");
    await expenses.open();
    await expenses.addExpense(factories.expense(name));
    await expenses.expectRow(name);

    await search.open();

    // Below the 2-char threshold → hint, no query fired.
    await search.type("a");
    await search.expectMinCharsHint();

    // A query that can't match anything → explicit empty state.
    await search.type("zzzqqqnomatch9999");
    await search.expectNoResults();

    // The unique prefix matches exactly our seeded expense.
    await search.type(sandbox.prefix);
    await search.expectResult(name);

    await search.pressEscape();
    await search.expectClosed();
  });

  test("opens with ⌘K and navigates to a result on Enter", async ({
    app,
    search,
    expenses,
    sandbox,
  }) => {
    const name = sandbox.name("Jumpable");
    await expenses.open();
    await expenses.addExpense(factories.expense(name));

    // Move off the expenses screen so the navigation is observable.
    await app.goto("/loans");
    await search.openWithKeyboard();
    await search.type(sandbox.prefix);
    await search.expectResult(name);

    await search.arrowDownAndOpen();
    await search.expectClosed();
    await app.expectRoute("/expenses");
  });
});
