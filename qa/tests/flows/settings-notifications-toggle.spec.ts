import { test, expect } from "../../fixtures";

/**
 * Settings → Notifications — a reminder-type switch flips and persists (autosave),
 * and is restored to its original state in a `finally` so shared property state
 * isn't left mutated. The switch has a stable id (`n-remindExpenses`).
 */
test.describe("Settings — reminder-type toggle", () => {
  test("toggling 'Recurring expenses' flips and restores", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Notifications");

    const sw = app.page.locator("#n-remindExpenses");
    await expect(sw).toBeVisible();
    const before = await sw.getAttribute("aria-checked");

    try {
      await sw.click();
      await app.settle(400);
      const after = await sw.getAttribute("aria-checked");
      expect(after).not.toBe(before);
    } finally {
      // Restore the original state.
      if ((await sw.getAttribute("aria-checked")) !== before) {
        await sw.click();
        await app.settle(400);
      }
    }
  });
});
