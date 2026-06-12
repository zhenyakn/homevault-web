import { test } from "../../fixtures";
import { assertNoA11yViolations } from "../../support/a11y";

/**
 * Accessibility gate — runs an axe-core audit on every primary screen and fails
 * on any serious/critical WCAG A/AA violation. Tagged `@responsive` so it also
 * executes under the mobile project (@responsive). RTL accessibility is covered
 * separately in qa/tests/rtl (which switches the UI to Hebrew at runtime).
 */
const SCREENS: Array<[name: string, route: string]> = [
  ["dashboard", "/"],
  ["calendar", "/calendar"],
  ["expenses", "/expenses"],
  ["loans", "/loans"],
  ["purchase-costs", "/purchase-costs"],
  ["repairs", "/repairs"],
  ["upgrades", "/upgrades"],
  ["inventory", "/inventory"],
  ["wishlist", "/wishlist"],
  ["settings", "/settings"],
];

for (const [name, route] of SCREENS) {
  test(`a11y: ${name} @responsive`, async ({ app }) => {
    await app.goto(route);
    await assertNoA11yViolations(app.page);
  });
}
