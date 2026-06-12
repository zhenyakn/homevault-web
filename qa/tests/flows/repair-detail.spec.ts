import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Repair detail — quotes, selection, payment & status", () => {
  test("add quote → select → log payment → advance status", async ({
    repairs,
    repairDetail,
    sandbox,
  }) => {
    // Arrange: a fresh repair we own, then drill in.
    await repairs.open();
    const title = sandbox.name("Repair");
    await repairs.logRepair(factories.repair(title));
    await repairs.openRepair(title);

    // Act + assert across the quote lifecycle.
    const contractor = sandbox.name("Contractor");
    await repairDetail.addQuote(contractor, "1500");
    await repairDetail.expectRow(contractor);

    await repairDetail.selectQuote();
    await repairDetail.expectQuoteSelected();

    await repairDetail.logPayment("500");
    await repairDetail.expectRow(/Paid/i);

    await repairDetail.changeStatus(/In Progress/i);
    await repairDetail.expectRow(/In Progress/i);
    // The repair (and its quotes/payments) are removed by sandbox API teardown.
  });
});
