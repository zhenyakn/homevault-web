import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Inventory — CRUD, search & validation", () => {
  test("create → edit → search → delete", async ({ inventory, sandbox }) => {
    await inventory.open();
    const name = sandbox.name("Item");

    await inventory.addItem(factories.inventory(name));
    await inventory.expectRow(name);

    await inventory.editItem(name, { quantity: "9" });
    await inventory.expectRow(name);

    await inventory.search(name);
    await inventory.expectRow(name);

    await inventory.search(""); // clear so the row is targetable for delete
    await inventory.deleteItem(name);
    await inventory.expectNoRow(name);
  });

  test("empty name is blocked", async ({ inventory }) => {
    await inventory.open();
    await inventory.tryCreateEmpty();
    await inventory.expectDialogStillOpen();
    await inventory.app.closeDialog();
  });
});
