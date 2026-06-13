import { test, expect } from "../../fixtures";

/**
 * Navigation — drives every primary sidebar entry and asserts it routes to the
 * right screen, the breadcrumb reflects the section, and unknown routes fall
 * through to the 404 page (whose "Go Home" button returns to the dashboard).
 *
 * This is the "click every nav button" breadth check: it guards against a nav
 * item pointing at the wrong route or a screen failing to mount.
 */

// label (exact sidebar button text) → [hash route, breadcrumb section]
const NAV: ReadonlyArray<[string, string, string]> = [
  ["Calendar", "/calendar", "Overview"],
  ["Expenses", "/expenses", "Finances"],
  ["Loans", "/loans", "Finances"],
  ["Purchase Costs", "/purchase-costs", "Finances"],
  ["Repairs", "/repairs", "Property"],
  ["Upgrades", "/upgrades", "Property"],
  ["Inventory", "/inventory", "Property"],
  ["Wishlist", "/wishlist", "Property"],
  ["Settings", "/settings", "Account"],
  ["Dashboard", "/", "Overview"],
];

test.describe("Navigation — sidebar routes, breadcrumb & 404", () => {
  test("every sidebar entry routes to its screen", async ({ app }) => {
    await app.goto("/");
    for (const [label, route, section] of NAV) {
      await app.clickNav(label);
      await app.expectRoute(route);
      // The breadcrumb section label is rendered in the desktop top bar.
      await expect(app.page.getByText(section, { exact: true }).first()).toBeVisible();
    }
  });

  test("unknown route shows the 404 page and Go Home recovers", async ({
    app,
  }) => {
    await app.goto("/this-route-does-not-exist");
    await expect(app.page.getByText(/Page Not Found/i)).toBeVisible();
    await expect(app.page.getByText("404")).toBeVisible();

    await app.clickButton(/Go Home/i);
    await app.settle();
    await app.expectRoute("/");
  });

  test("active nav item is highlighted for the current screen", async ({
    app,
  }) => {
    await app.goto("/expenses");
    const expensesNav = app.page
      .getByRole("button", { name: "Expenses", exact: true })
      .first();
    await expect(expensesNav).toHaveAttribute("data-active", "true");
  });
});
