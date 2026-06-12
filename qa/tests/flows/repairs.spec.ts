import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Repairs — log, delete (AlertDialog) & validation", () => {
  test("log → appears in list → delete via confirm dialog", async ({
    repairs,
    sandbox,
  }) => {
    await repairs.open();
    const title = sandbox.name("Repair");

    await repairs.logRepair(factories.repair(title));
    await repairs.expectRow(title);

    await repairs.deleteRepair(title);
    await repairs.expectNoRow(title);
  });

  test("empty title is blocked (silent guard keeps dialog open)", async ({
    repairs,
  }) => {
    await repairs.open();
    await repairs.tryCreateEmpty();
    await repairs.expectDialogStillOpen();
    await repairs.app.closeDialog();
  });
});
