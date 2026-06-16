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

// ── Behavioural RTL assertions ───────────────────────────────────────────────
// The smoke test above only proves `dir=rtl` and "didn't crash" — it renders a
// mirrored-the-wrong-way toggle or a left-pinned close button perfectly happily.
// These assertions measure the geometry that actually broke, so a regression in
// the logical-utility / icon-mirroring work fails CI instead of a screenshot.

const centerX = async (loc: import("@playwright/test").Locator) => {
  const box = await loc.boundingBox();
  if (!box) throw new Error("element not visible");
  return box.x + box.width / 2;
};

test("toggle thumb travels the correct way in RTL @rtl", async ({ app }) => {
  await switchToHebrew(app);
  // A reminder switch with a stable id (see settings-notifications-toggle flow).
  await app.page.evaluate(() => {
    window.location.hash = "#/settings/notifications";
  });
  await app.settle();

  const sw = app.page.locator("#n-remindExpenses");
  await expect(sw).toBeVisible();
  const thumb = sw.locator('[data-slot="switch-thumb"]');

  // In RTL the track is mirrored: ON pushes the thumb to the inline-end (LEFT),
  // OFF rests it at the inline-start (RIGHT). (Before the fix the physical
  // translate-x sent it the wrong way.)
  const sideForState = async () =>
    (await centerX(thumb)) < (await centerX(sw)) ? "left" : "right";
  const expectedSide = (checked: boolean) => (checked ? "left" : "right");

  const startChecked = (await sw.getAttribute("aria-checked")) === "true";
  expect(await sideForState()).toBe(expectedSide(startChecked));

  try {
    await sw.click();
    await app.settle(400);
    const nowChecked = (await sw.getAttribute("aria-checked")) === "true";
    expect(nowChecked).toBe(!startChecked);
    expect(await sideForState()).toBe(expectedSide(nowChecked));
  } finally {
    // Restore shared state so re-runs and other specs stay deterministic.
    if (((await sw.getAttribute("aria-checked")) === "true") !== startChecked) {
      await sw.click();
      await app.settle(400);
    }
  }
});

test("dialog close button sits on the inline-start side in RTL @rtl", async ({
  app,
}) => {
  await switchToHebrew(app);
  await app.page.evaluate(() => {
    window.location.hash = "#/expenses";
  });
  await app.settle();

  // Open the add-expense dialog via its (+) icon — text labels are translated,
  // the lucide-plus glyph is not.
  await app.page
    .locator("#main-content button:has(svg.lucide-plus)")
    .first()
    .click();
  const dialog = app.page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();

  const close = app.page.locator('[data-slot="dialog-close"]').first();
  // inline-start in RTL is the LEFT half — the X must mirror there, not stay
  // pinned to top-right as the physical `right-4` did.
  expect(await centerX(close)).toBeLessThan(await centerX(dialog));

  await app.closeDialog();
});

test("directional chevrons mirror in RTL @rtl", async ({ app }) => {
  await switchToHebrew(app);
  // The calendar's prev/next month controls are always-present chevrons.
  await app.page.evaluate(() => {
    window.location.hash = "#/calendar";
  });
  await app.settle();

  // `rtl:rotate-180` compiles to the CSS `rotate` property in Tailwind v4.
  const rotations = await app.page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "#main-content svg.lucide-chevron-left, #main-content svg.lucide-chevron-right"
      )
    ).map(el => getComputedStyle(el).rotate)
  );
  expect(rotations.length).toBeGreaterThan(0);
  for (const rotate of rotations) expect(rotate).toBe("180deg");
});
