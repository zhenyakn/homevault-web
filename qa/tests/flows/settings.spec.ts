import { test, expect } from "../../fixtures";

/**
 * Settings — section navigation + the controls that have real, testable
 * behaviour without polluting other tests:
 *  - every side-nav section mounts its content,
 *  - the Appearance theme tiles flip the <html> theme class,
 *  - the Regional/Notifications controls render,
 *  - Data → Download JSON triggers a file download,
 *  - the destructive "Delete all" dialog gates its action behind a typed phrase
 *    (we verify the guard and cancel — never actually delete).
 *
 * Language switching is intentionally NOT exercised here: it persists to the
 * NO_AUTH user server-side (a per-process cache) and would leak into other
 * desktop specs. The dedicated `rtl` project covers the Hebrew switch instead;
 * here we only assert the language options are present.
 */
test.describe("Settings — sections, theme, export & danger zone", () => {
  // Property & Purchase settings moved to the Portfolio page.
  const SECTIONS: ReadonlyArray<[string, RegExp]> = [
    ["Household", /^Household$/],
    ["Regional", /^Regional$/],
    ["Notifications", /^Notifications$/],
    ["Integrations", /^Integrations$/],
    ["Appearance", /^Appearance$/],
    ["Data", /^Data$/],
  ];

  test("every side-nav section mounts", async ({ settings }) => {
    await settings.open();
    for (const [nav, heading] of SECTIONS) {
      await settings.openSection(nav);
      await settings.expectSectionHeading(heading);
    }
  });

  test("Appearance theme tiles flip the html theme class", async ({
    settings,
  }) => {
    await settings.open();
    await settings.openSection("Appearance");

    await settings.setTheme("Dark");
    await settings.expectThemeClass("dark");

    await settings.setTheme("Light");
    await settings.expectThemeClass("light");

    await settings.expectLanguageOptions();
  });

  test("Regional section shows currency & timezone controls", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Regional");
    await app.expectVisible(/Currency/i);
    await app.expectVisible(/Timezone/i);
    await app.expectVisible(/Start of week/i);
  });

  test("Notifications section shows lead-time and reminder toggles", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Notifications");
    await app.expectVisible(/Lead time/i);
    await app.expectVisible(/Reminder types/i);
    await app.expectVisible(/Recurring expenses/i);
    // The reminder-type switches are real, toggleable controls.
    await expect(
      app.page.locator("#main-content").getByRole("switch").first()
    ).toBeVisible();
  });

  test("Data → Download JSON exports a file", async ({ settings }) => {
    await settings.open();
    await settings.openSection("Data");
    const download = await settings.downloadJson();
    expect(download.suggestedFilename()).toMatch(/homevault_.*\.json/);
  });

  test("Delete-all dialog is gated by the type-to-confirm phrase", async ({
    settings,
    app,
  }) => {
    await settings.open();
    await settings.openSection("Data");
    await settings.openDeleteAll();

    const dialog = settings.alertDialog();
    const confirm = dialog.getByRole("button", { name: /Confirm/i });
    // Disabled until the exact property name is typed.
    await expect(confirm).toBeDisabled();

    // Cancel without confirming — nothing is deleted.
    await dialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(settings.alertDialog()).toHaveCount(0);
  });
});
