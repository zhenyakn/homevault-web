import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Wishlist — CRUD, mark-purchased & validation", () => {
  test("create → edit → mark purchased → delete", async ({
    wishlist,
    sandbox,
  }) => {
    await wishlist.open();
    const name = sandbox.name("Wish");

    await wishlist.addItem(factories.wishlist(name));
    await wishlist.expectRow(name);

    await wishlist.editItem(name, { estimatedCost: "1500" });
    await wishlist.expectRow(name);

    await wishlist.markPurchased(name);
    await wishlist.expectPurchased(name);

    await wishlist.deleteItem(name);
    await wishlist.expectNoRow(name);
  });

  test("rejects a missing label (native required blocks submit)", async ({
    wishlist,
  }) => {
    await wishlist.open();
    await wishlist.tryCreateEmpty();
    await wishlist.expectDialogStillOpen();
    await wishlist.app.closeDialog();
  });
});
