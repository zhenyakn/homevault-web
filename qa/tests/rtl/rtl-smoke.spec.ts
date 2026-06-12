import { test, expect } from "../../fixtures";
import { assertNoA11yViolations } from "../../support/a11y";
import type { Driver } from "../../support/driver";

/**
 * RTL coverage — switches the UI to Hebrew through the real in-app control
 * (Settings → Appearance → עברית) and verifies the app renders right-to-left
 * across screens, plus an accessibility audit in RTL.
 *
 * Why the UI toggle (not a header/localStorage)? The server caches the NO_AUTH
 * user's language per process (server/_core/context.ts), so it can't be flipped
 * per-test from the back end. Toggling in-app flips it client-side and sticks
 * (the one-time server reconciliation has already run on load). We then navigate
 * client-side via the hash (no full reload, which would re-run reconciliation
 * and revert to the English server default).
 *
 * `@rtl` is the tag the rtl project greps; the guard makes it a no-op elsewhere.
 */
const ROUTES: Array<[name: string, route: string]> = [
  ["dashboard", "/"],
  ["expenses", "/expenses"],
  ["loans", "/loans"],
  ["repairs", "/repairs"],
  ["upgrades", "/upgrades"],
  ["inventory", "/inventory"],
  ["wishlist", "/wishlist"],
  ["purchase-costs", "/purchase-costs"],
  ["calendar", "/calendar"],
  ["settings", "/settings"],
];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "rtl", "RTL-only spec");
});

/**
 * Switch the UI to Hebrew via the in-app language toggle and confirm dir=rtl.
 * Navigates straight to the Appearance settings section by URL (the nav label
 * is itself translated, so it isn't a reliable target) and clicks the "עברית"
 * option, whose label is the same regardless of the current language — so this
 * works whether the app is currently English or already Hebrew.
 */
async function switchToHebrew(app: Driver): Promise<void> {
  await app.goto("/settings/appearance");
  await app.page.getByText("עברית").first().click();
  await app.settle();
  await expect(app.page.locator("html")).toHaveAttribute("dir", "rtl");
}

test("renders RTL across every screen @rtl", async ({ app }) => {
  await switchToHebrew(app);

  for (const [name, route] of ROUTES) {
    // Client-side hash navigation keeps the Hebrew session (no reload/revert).
    await app.page.evaluate(r => {
      window.location.hash = r;
    }, `#${route}`);
    await app.settle();
    await expect(app.page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(app.page.getByText(/something went wrong/i)).toHaveCount(0);
    await app.screenshot(`rtl-${name}`);
  }
});

test("accessibility holds in Hebrew / RTL @rtl", async ({ app }) => {
  await switchToHebrew(app);
  await app.page.evaluate(() => {
    window.location.hash = "#/expenses";
  });
  await app.settle();
  await assertNoA11yViolations(app.page);
});
