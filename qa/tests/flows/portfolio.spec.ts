import { test, expect } from "../../fixtures";

/**
 * Portfolio — the multi-property overview / property-settings home, reachable by
 * deep link. Verifies the active property card renders and that the per-property
 * settings (relocated here from Settings) autosave on blur. The add-property
 * wizard has its own spec (property-wizard.spec.ts).
 */
test.describe("Portfolio — property cards", () => {
  test("shows the active property card", async ({ portfolio }) => {
    await portfolio.open();
    await portfolio.expectHeading();
    await portfolio.expectActiveBadge();
  });

  test("property nickname autosaves on blur and round-trips", async ({
    portfolio,
    app,
    sandbox,
  }) => {
    await portfolio.open();
    // The active property is selected by default; its settings live on Details.
    await app.page.getByRole("tab", { name: /^Details$/i }).click();

    const nick = app.page.getByTestId("property-nickname");
    await expect(nick).toBeVisible();
    const original = await nick.inputValue();
    const updated = sandbox.name("Nick");
    try {
      await nick.fill(updated);
      await nick.blur();
      // After autosave the list refetches and the field remounts with the value.
      await expect(app.page.getByTestId("property-nickname")).toHaveValue(
        updated
      );
    } finally {
      const restore = app.page.getByTestId("property-nickname");
      await restore.fill(original);
      await restore.blur();
      await expect(app.page.getByTestId("property-nickname")).toHaveValue(
        original
      );
    }
  });
});
