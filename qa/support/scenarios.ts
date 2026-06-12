import { test, expect } from "../fixtures";

/**
 * Reusable scenario builders.
 *
 * Each QA scenario lives in its own file under `qa/tests/`, but many share the
 * same shape (e.g. "this screen loads with data"). These builders keep the
 * per-scenario files thin and declarative while the assertions stay in one
 * place.
 */

/**
 * "Screen loads" scenario: navigate to a route, assert the app did not fall
 * into its error boundary, assert the expected heading is visible, and capture
 * a full-page screenshot for visual review.
 */
export function screenLoadsScenario(opts: {
  name: string;
  route: string;
  heading: RegExp;
}): void {
  // `@responsive` tags this breadth check to also run on the mobile + RTL projects.
  test(`screen loads: ${opts.name} @responsive`, async ({ app }) => {
    await app.goto(opts.route);

    await expect(app.page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(
      app.page.getByRole("heading", { name: opts.heading }).first(),
    ).toBeVisible();

    await app.screenshot(`screen-${opts.name}`);
  });
}
