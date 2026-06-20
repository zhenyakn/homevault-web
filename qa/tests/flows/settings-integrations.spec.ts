import { test, expect } from "../../fixtures";

/**
 * Settings → Integrations — local-only integration controls (no external
 * services touched):
 *  - the Storage & files category header folds/unfolds its content,
 *  - the Maps provider segmented control (inside the Maps dialog) switches
 *    Google ↔ OpenStreetMap and persists (restored to the original in a finally).
 */
test.describe("Settings — integrations chrome", () => {
  test("a category header collapses and expands its content", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Integrations");

    const header = app.page
      .locator("#main-content")
      .getByRole("button", { name: /Storage & files/i });
    await expect(header).toBeVisible();

    const before = await header.getAttribute("aria-expanded");
    await header.click();
    await app.settle(300);
    expect(await header.getAttribute("aria-expanded")).not.toBe(before);

    await header.click();
    await app.settle(300);
    expect(await header.getAttribute("aria-expanded")).toBe(before);
  });

  test("maps provider toggles Google ↔ OpenStreetMap and restores", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Integrations");
    // The Maps control now lives in a dialog opened from its services tile.
    await app.page
      .locator("#main-content")
      .getByRole("button", { name: /^Maps/ })
      .first()
      .click();
    const dialog = app.page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The only toggle-group containing "OpenStreetMap" is the Maps control.
    const maps = dialog
      .locator('[data-slot="toggle-group"]')
      .filter({ hasText: "OpenStreetMap" });
    await expect(maps).toBeVisible();

    const original = (
      await maps.locator('[data-state="on"]').textContent()
    )?.trim();

    try {
      await maps.getByText("OpenStreetMap", { exact: true }).click();
      await app.settle(400);
      await expect(maps.locator('[data-state="on"]')).toHaveText(
        "OpenStreetMap"
      );
    } finally {
      await maps.getByText(original ?? "Google", { exact: true }).click();
      await app.settle(400);
      await expect(maps.locator('[data-state="on"]')).toHaveText(
        original ?? "Google"
      );
    }
  });
});
