import { test } from "../../fixtures";

/**
 * Property dashboard ("/property") — read-only details summary with an
 * "Edit in Settings" shortcut. The seeded property is fully configured, so the
 * details card renders (rather than the "no property found" empty state).
 */
test.describe("Property dashboard — details & edit shortcut", () => {
  test("renders the property details card", async ({ propertyDashboard }) => {
    await propertyDashboard.open();
    await propertyDashboard.expectDetailsCard();
  });

  test("'Edit in Settings' routes to settings", async ({
    propertyDashboard,
  }) => {
    await propertyDashboard.open();
    await propertyDashboard.editInSettings();
  });
});
