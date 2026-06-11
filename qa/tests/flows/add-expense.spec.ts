import { test, expect } from "../../fixtures";

/**
 * Data-entry flow — exercises the full "add expense" journey end to end:
 * open dialog → type text → enter a number → pick a Radix <Select> option →
 * submit → assert the new row shows up in the list.
 *
 * This is the depth pass: it proves the Driver can drive real forms (inputs,
 * selects, buttons) and that a create round-trips through tRPC into the UI.
 */
test("add an expense and see it in the list", async ({ app }) => {
  await app.goto("/expenses");
  await app.expectVisible(/Expenses/i);

  const name = `QA Test Expense ${Date.now()}`;

  // Open the create dialog.
  await app.clickButton(/Add expense/i);
  await expect(
    app.page.getByRole("dialog").getByText(/Add expense/i).first(),
  ).toBeVisible();

  // Fill the form.
  await app.fill(/Description/i, name);
  await app.fill(/Amount/i, "123.45");
  await app.select(/Utilities/i); // Category select (first combobox in dialog)
  await app.fill(/Notes/i, "created by automated QA");

  // Submit — the dialog's primary button is also labelled "Add expense".
  await app.page
    .getByRole("dialog")
    .getByRole("button", { name: /Add expense/i })
    .click();

  // Dialog closes and the new expense appears in the list.
  await expect(app.page.getByRole("dialog")).toHaveCount(0);
  await expect(app.page.getByText(name)).toBeVisible();

  await app.screenshot("flow-expense-created");
});
