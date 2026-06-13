import { test, expect } from "../../fixtures";

/**
 * Sidebar chrome — the layout controls that live outside any single screen:
 *  - the collapse / expand toggle switches the rail between full and icon mode,
 *  - the footer theme segmented control (Light / Dark / System) flips the
 *    <html> theme class (distinct from the Settings → Appearance tiles).
 */
test.describe("Sidebar — collapse & theme toggle", () => {
  test("collapses and expands the rail", async ({ app }) => {
    await app.goto("/");

    // Starts expanded → the collapse control is present.
    const collapse = app.page.getByRole("button", {
      name: /Collapse sidebar/i,
    });
    await expect(collapse).toBeVisible();
    await collapse.click();
    await app.settle(300);

    // Collapsed → the expand control takes its place.
    const expand = app.page.getByRole("button", { name: /Expand sidebar/i });
    await expect(expand).toBeVisible();
    await expand.click();
    await app.settle(300);

    await expect(
      app.page.getByRole("button", { name: /Collapse sidebar/i })
    ).toBeVisible();
  });

  test("footer theme control flips the html theme class", async ({ app }) => {
    await app.goto("/");

    await app.page
      .getByRole("button", { name: "Dark", exact: true })
      .first()
      .click();
    await app.settle(300);
    await expect(app.page.locator("html")).toHaveClass(/\bdark\b/);

    await app.page
      .getByRole("button", { name: "Light", exact: true })
      .first()
      .click();
    await app.settle(300);
    await expect(app.page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});
