import { test } from "../../fixtures";

/**
 * Portfolio — the multi-property overview / property-settings home, reachable by
 * deep link. Verifies the active property card renders. The add-property wizard
 * has its own spec (property-wizard.spec.ts).
 */
test.describe("Portfolio — property cards", () => {
  test("shows the active property card", async ({ portfolio }) => {
    await portfolio.open();
    await portfolio.expectHeading();
    await portfolio.expectActiveBadge();
  });
});
