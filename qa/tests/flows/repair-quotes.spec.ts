import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Repair detail — multiple quotes. A repair can collect several contractor
 * quotes; both should be listed and one can be selected. Complements
 * repair-detail.spec (single-quote lifecycle) with the comparison case.
 */
test.describe("Repair detail — multiple quotes", () => {
  test("two quotes are listed and one can be selected", async ({
    repairs,
    repairDetail,
    sandbox,
  }) => {
    await repairs.open();
    const title = sandbox.name("MultiRepair");
    await repairs.logRepair(factories.repair(title));
    await repairs.openRepair(title);

    const cheap = sandbox.name("CheapCo");
    const pricey = sandbox.name("PriceyCo");
    await repairDetail.addQuote(cheap, "800");
    await repairDetail.expectRow(cheap);
    await repairDetail.addQuote(pricey, "2400");
    await repairDetail.expectRow(pricey);

    // Both remain listed after the second add.
    await repairDetail.expectRow(cheap);

    await repairDetail.selectQuote();
    await repairDetail.expectQuoteSelected();
  });
});
