import { test, expect } from "../../fixtures";

/**
 * Settings → Integrations — the Telegram bot config (opened from its directory
 * tile) generates a real link code (an "HV-xxxx-xxx" token minted server-side,
 * no bot connection required) and reveals a copy affordance. Verifies the
 * connect flow's first step works.
 */
test.describe("Settings — Telegram link code", () => {
  test("'Generate link code' reveals a code to copy", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Integrations");
    // The Telegram setup now lives in a dialog opened from its channel tile.
    await app.page
      .locator("#main-content")
      .getByRole("button", { name: /^Telegram/ })
      .first()
      .click();
    const dialog = app.page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const generate = dialog.getByRole("button", {
      name: /Generate link code/i,
    });
    await expect(generate).toBeVisible();
    await generate.click();
    await app.settle(600);

    // A code of the form HV-xxxx-xxx is shown, plus a Copy affordance.
    await expect(
      dialog.getByText(/HV-[A-Za-z0-9]+-[A-Za-z0-9]+/)
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Copy code/i })
    ).toBeVisible();
  });
});
