import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Upgrade detail — shopping-list item deletion. Two items are added to a
 * project; deleting one (native confirm) removes it while the other remains.
 * Complements upgrade-detail.spec (add + toggle purchased).
 */
test.describe("Upgrade detail — item add & delete", () => {
  test("delete one of two items leaves the other", async ({
    upgrades,
    upgradeDetail,
    sandbox,
  }) => {
    await upgrades.open();
    const title = sandbox.name("ItemProject");
    await upgrades.createProject(factories.upgrade(title));
    await upgrades.openProject(title);

    const keep = sandbox.name("Keep");
    const drop = sandbox.name("Drop");
    await upgradeDetail.addItem(keep);
    await upgradeDetail.expectRow(keep);
    await upgradeDetail.addItem(drop);
    await upgradeDetail.expectRow(drop);

    await upgradeDetail.deleteItem(drop);
    await upgradeDetail.expectNoRow(drop);
    await upgradeDetail.expectRow(keep);
  });
});
