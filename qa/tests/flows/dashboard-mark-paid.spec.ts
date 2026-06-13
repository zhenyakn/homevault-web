import { test, expect } from "../../fixtures";

/**
 * Dashboard quick-action — the Needs-attention card surfaces overdue recurring
 * bills (unpaid, recurring, due on/before today) with an inline "Mark paid"
 * button. We seed exactly such an expense, confirm it appears, mark it paid from
 * the dashboard, and assert its action disappears. Sandbox-named → auto-cleaned.
 */
test.describe("Dashboard — overdue 'Mark paid' quick-action", () => {
  test("marks a seeded overdue expense paid from the attention card", async ({
    expenses,
    dashboard,
    app,
    sandbox,
  }) => {
    const name = sandbox.name("Overdue");
    const past = new Date();
    past.setDate(past.getDate() - 60);
    const pastDate = past.toISOString().slice(0, 10);

    await expenses.open();
    await expenses.addExpense({
      name,
      amount: "120",
      category: "Utilities",
      date: pastDate,
      recurring: true,
    });
    // (The expenses list defaults to the current month, so a 60-day-old row
    // isn't shown there — its home is the dashboard's overdue card.)

    await dashboard.open();
    await dashboard.expectCard(/Needs attention/i);
    // The overdue expense is listed with its quick-action.
    await expect(dashboard.markPaidButton(sandbox.prefix)).toHaveCount(1);

    await dashboard.markAttentionPaid(sandbox.prefix);

    // Once paid (and locally dismissed) the action for this expense is gone.
    await expect(dashboard.markPaidButton(sandbox.prefix)).toHaveCount(0);
  });
});
