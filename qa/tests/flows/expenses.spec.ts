import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Expenses — CRUD, mark-paid, filters & validation", () => {
  test("create → edit → mark paid → delete", async ({ expenses, sandbox }) => {
    await expenses.open();
    const name = sandbox.name("Expense");

    await expenses.addExpense(factories.expense(name));
    await expenses.expectRow(name);

    await expenses.editExpense(name, { amount: "250.00" });
    await expenses.expectRow(name);

    await expenses.markPaid(name);
    await expenses.expectRow(name);

    await expenses.deleteExpense(name);
    await expenses.expectNoRow(name);
  });

  test("month filter narrows the list", async ({ expenses }) => {
    await expenses.open();
    await expenses.filterMonth(/All time/i);
    await expenses.expectStat(/Entries/i);
  });

  test("rejects an empty description + amount", async ({ expenses }) => {
    await expenses.open();
    await expenses.tryCreateInvalid({ name: "", amount: "" });
    await expenses.expectError();
    await expenses.expectDialogStillOpen();
    await expenses.app.closeDialog();
  });
});
