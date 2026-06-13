import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Loans — repayment progress. A loan of 10,000 repaid in two 2,500 instalments
 * should read 50% repaid on its card. Exercises the repayment dialog twice and
 * the computed progress bar/percentage. Sandbox-named, auto-cleaned.
 */
test.describe("Loans — repayments accumulate into progress", () => {
  test("two repayments reach 50% on a 10,000 loan", async ({
    loans,
    app,
    sandbox,
  }) => {
    await loans.open();
    const lender = sandbox.name("Bank");
    await loans.addLoan({ ...factories.loan(lender), amount: "10000" });
    await loans.expectRow(lender);

    await loans.addRepayment(lender, "2500");
    await loans.addRepayment(lender, "2500");

    // 5,000 of 10,000 repaid → the card shows 50%.
    await app.rowFor(lender).getByText(/50%/).first().waitFor();
  });
});
