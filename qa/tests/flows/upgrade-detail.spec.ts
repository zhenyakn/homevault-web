import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Upgrade detail — options, payments & items", () => {
  test("add option → select → pay; add item → toggle purchased", async ({
    upgrades,
    upgradeDetail,
    sandbox,
  }) => {
    await upgrades.open();
    const title = sandbox.name("Project");
    await upgrades.createProject(factories.upgrade(title));
    await upgrades.openProject(title);

    const option = sandbox.name("Vendor");
    await upgradeDetail.addOption(option, "8000");
    await upgradeDetail.expectRow(option);
    await upgradeDetail.selectOption();
    await upgradeDetail.expectOptionSelected();
    await upgradeDetail.logPayment("2000");
    await upgradeDetail.expectRow(/Paid/i);

    const item = sandbox.name("Item");
    await upgradeDetail.addItem(item);
    await upgradeDetail.expectRow(item);
    await upgradeDetail.toggleItemPurchased();
    await upgradeDetail.expectRow(item);
    // Project + options/items/payments removed by sandbox API teardown.
  });
});
