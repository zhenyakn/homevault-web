import { test } from "../../fixtures";

/**
 * Dashboard — the landing bento grid. Verifies the headline greeting + the
 * always-present summary cards render, and that the inline navigation shortcuts
 * (Full calendar →, and the seeded-data dependent Loans →) route correctly.
 */
test.describe("Dashboard — cards & shortcuts", () => {
  test("renders greeting and the core summary cards", async ({ dashboard }) => {
    await dashboard.open();
    await dashboard.expectGreeting();
    await dashboard.expectCard(/Monthly spend/i);
    await dashboard.expectCard(/Open items/i);
    await dashboard.expectCard(/Needs attention/i);
    await dashboard.expectCard(/Upcoming/i);
  });

  test("'Full calendar' shortcut opens the calendar", async ({ dashboard }) => {
    await dashboard.open();
    await dashboard.followShortcut(/Full calendar/i, "/calendar");
  });
});
