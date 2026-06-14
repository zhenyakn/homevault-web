import { test, expect } from "../../fixtures";

/**
 * Settings → Integrations — the Telegram bot card generates a real link code
 * (an "HV-xxxx-xxx" token minted server-side, no bot connection required) and
 * reveals a copy affordance. Verifies the connect flow's first step works.
 */
test.describe("Settings — Telegram link code", () => {
  test("'Generate link code' reveals a code to copy", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Integrations");
    // The Telegram card lives inside the (collapsed-by-default) channels group.
    await settings.expandCategory(/Notification channels/i);

    const generate = app.page.getByRole("button", {
      name: /Generate link code/i,
    });
    await expect(generate).toBeVisible();
    await generate.click();
    await app.settle(600);

    // A code of the form HV-xxxx-xxx is shown, plus a Copy affordance.
    await expect(
      app.page.getByText(/HV-[A-Za-z0-9]+-[A-Za-z0-9]+/)
    ).toBeVisible();
    await expect(
      app.page.getByRole("button", { name: /Copy code/i })
    ).toBeVisible();
  });
});
