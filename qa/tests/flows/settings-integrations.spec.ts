import { test, expect } from "../../fixtures";

/**
 * Settings → Integrations — local-only integration controls (no external
 * services touched):
 *  - the collapsible category headers fold/unfold their content,
 *  - the Maps provider segmented control switches Google ↔ OpenStreetMap and
 *    persists (restored to the original in a finally).
 */
test.describe("Settings — integrations chrome", () => {
  test("a category header collapses and expands its content", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Integrations");

    const header = app.page.getByRole("button", {
      name: /Connected services/i,
    });
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

    // The only toggle-group containing "OpenStreetMap" is the Maps control.
    const maps = app.page
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
