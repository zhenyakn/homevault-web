import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Loans — CRUD, repayment & validation", () => {
  test("create → edit → add repayment → delete", async ({ loans, sandbox }) => {
    await loans.open();
    const lender = sandbox.name("Lender");

    await loans.addLoan(factories.loan(lender));
    await loans.expectRow(lender);

    await loans.editLoan(lender, { interestRate: "4.25" });
    await loans.expectRow(lender);

    await loans.addRepayment(lender, "5000");
    await loans.expectRow(lender);

    await loans.deleteLoan(lender);
    await loans.expectNoRow(lender);
  });

  test("rejects a zero amount", async ({ loans, sandbox }) => {
    await loans.open();
    await loans.tryCreateInvalidAmount(sandbox.name("BadLoan"));
    await loans.expectError(/valid amount/i);
    await loans.expectDialogStillOpen();
    await loans.app.closeDialog();
  });
});
