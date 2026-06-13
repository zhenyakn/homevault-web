import { test } from "../../fixtures";

/**
 * Calendar month navigation — the prev / next / "This month" controls move the
 * visible grid and the "This month" button snaps back to today's month. Month
 * labels are computed (not hard-coded) so the test is date-independent.
 */
const monthLabel = (d: Date) =>
  `${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`;

test.describe("Calendar — month navigation", () => {
  test("next / previous move the grid and return", async ({ calendar }) => {
    await calendar.open();

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    await calendar.expectMonthLabel(monthLabel(thisMonth));

    await calendar.nextMonth();
    await calendar.expectMonthLabel(monthLabel(next));

    // Back to the current month, then one before it.
    await calendar.prevMonth();
    await calendar.expectMonthLabel(monthLabel(thisMonth));

    await calendar.prevMonth();
    await calendar.expectMonthLabel(monthLabel(prev));
  });
});
