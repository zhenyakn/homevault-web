import { test, expect } from "../fixtures";

/**
 * Smoke suite — visits every primary screen, asserts it rendered (no error
 * boundary, expected heading present) and captures a full-page screenshot into
 * qa/artifacts for visual review.
 *
 * This is the breadth pass: "does every menu/screen still load with data?"
 */
const SCREENS: Array<{ name: string; route: string; heading: RegExp }> = [
  { name: "dashboard", route: "/", heading: /.+/ },
  { name: "calendar", route: "/calendar", heading: /Calendar/i },
  { name: "expenses", route: "/expenses", heading: /Expenses/i },
  { name: "loans", route: "/loans", heading: /Loans/i },
  { name: "purchase-costs", route: "/purchase-costs", heading: /Purchase/i },
  { name: "repairs", route: "/repairs", heading: /Repairs/i },
  { name: "upgrades", route: "/upgrades", heading: /Upgrades|Projects/i },
  { name: "inventory", route: "/inventory", heading: /Inventory/i },
  { name: "wishlist", route: "/wishlist", heading: /Wishlist/i },
  // Settings opens on its default "Property" section (no "Settings" heading).
  { name: "settings", route: "/settings", heading: /Property/i },
];

for (const screen of SCREENS) {
  test(`screen loads: ${screen.name}`, async ({ app }) => {
    await app.goto(screen.route);

    // The app must not have fallen into its error boundary.
    await expect(
      app.page.getByText(/something went wrong/i),
    ).toHaveCount(0);

    // The expected page heading is present.
    await expect(
      app.page.getByRole("heading", { name: screen.heading }).first(),
    ).toBeVisible();

    await app.screenshot(`smoke-${screen.name}`);
  });
}
