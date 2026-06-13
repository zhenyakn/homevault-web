import { test, expect } from "../../fixtures";

/**
 * Mobile navigation — the bottom tab bar (Dashboard / Expenses / Repairs /
 * Calendar + "More"). It renders only under the 768px mobile breakpoint, so the
 * test is tagged @responsive (to run on the Pixel-7 `mobile` project) and skips
 * itself on the wider desktop/RTL viewports where the tab bar isn't mounted.
 */
test.describe("Mobile — bottom tab bar", () => {
  test("primary tabs route and 'More' opens the full nav @responsive", async ({
    app,
  }) => {
    const vp = app.page.viewportSize();
    test.skip(!vp || vp.width >= 768, "mobile-only bottom tab bar");

    await app.goto("/");
    const tabbar = app.page.getByRole("navigation", {
      name: /Primary navigation/i,
    });
    await expect(tabbar).toBeVisible();

    await tabbar.getByRole("button", { name: "Expenses", exact: true }).click();
    await app.settle();
    await app.expectRoute("/expenses");

    await tabbar.getByRole("button", { name: "Repairs", exact: true }).click();
    await app.settle();
    await app.expectRoute("/repairs");

    await tabbar.getByRole("button", { name: "Calendar", exact: true }).click();
    await app.settle();
    await app.expectRoute("/calendar");

    // "More" opens the full sidebar sheet for the secondary routes.
    await tabbar.getByRole("button", { name: /More/i }).click();
    await app.settle(500);
    const sheet = app.page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Settings", exact: true }).click();
    await app.settle();
    await app.expectRoute("/settings");
  });
});
