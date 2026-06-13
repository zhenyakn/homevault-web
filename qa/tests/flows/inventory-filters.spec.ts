import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Inventory — category filtering + edit. Creates one sandbox-named Appliance,
 * edits its quantity, then proves the category dropdown includes it under
 * "Appliance" and excludes it under "Furniture". Sandbox-named, auto-cleaned.
 */
test.describe("Inventory — edit & category filter", () => {
  test("edit quantity, then filter by category includes/excludes", async ({
    inventory,
    sandbox,
  }) => {
    await inventory.open();
    const name = sandbox.name("Gadget"); // category: Appliance
    await inventory.addItem(factories.inventory(name));
    await inventory.expectRow(name);

    // Edit is reachable and persists.
    await inventory.editItem(name, { quantity: "9" });
    await inventory.expectRow(name);

    // A non-matching category hides it…
    await inventory.filterCategory(/Furniture/i);
    await inventory.expectNoRow(name);

    // …and the matching category brings it back.
    await inventory.filterCategory(/Appliance/i);
    await inventory.expectRow(name);
  });
});
