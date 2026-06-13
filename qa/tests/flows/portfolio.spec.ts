import { test, expect } from "../../fixtures";

/**
 * Portfolio — the multi-property overview, reachable by deep link even with a
 * single property (the sidebar entry only appears with 2+). Verifies the active
 * property card and that the add-property dialog opens and cancels cleanly
 * (without creating anything).
 */
test.describe("Portfolio — property cards & add dialog", () => {
  test("shows the active property card", async ({ portfolio }) => {
    await portfolio.open();
    await portfolio.expectHeading();
    await portfolio.expectActiveBadge();
  });

  test("add-property dialog opens and cancels", async ({ portfolio, app }) => {
    await portfolio.open();
    await portfolio.openAddProperty();
    await app
      .dialog()
      .getByRole("button", { name: /Cancel/i })
      .click();
    await app.expectDialogOpen(false);
  });

  test("add-property Add button is gated on a non-empty name", async ({
    portfolio,
    app,
  }) => {
    await portfolio.open();
    await portfolio.openAddProperty();
    const add = app.dialog().getByRole("button", { name: /^Add$/ });
    // Empty name → guard keeps the Add button disabled.
    await expect(add).toBeDisabled();
    await app
      .dialog()
      .getByPlaceholder(/Property name/i)
      .fill("QA temp name");
    await expect(add).toBeEnabled();
    // Cancel without submitting — no property is created.
    await app.closeDialog();
    await app.expectDialogOpen(false);
  });
});
