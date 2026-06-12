import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Purchase Costs — CRUD & validation", () => {
  test("create → edit → delete", async ({ purchaseCosts, sandbox }) => {
    await purchaseCosts.open();
    const name = sandbox.name("Cost");

    await purchaseCosts.addCost(factories.purchaseCost(name));
    await purchaseCosts.expectRow(name);

    await purchaseCosts.editCost(name, { amount: "5000" });
    await purchaseCosts.expectRow(name);

    await purchaseCosts.deleteCost(name);
    await purchaseCosts.expectNoRow(name);
  });

  test("empty label is blocked", async ({ purchaseCosts }) => {
    await purchaseCosts.open();
    await purchaseCosts.tryCreateEmpty();
    await purchaseCosts.expectDialogStillOpen();
    await purchaseCosts.app.closeDialog();
  });
});
