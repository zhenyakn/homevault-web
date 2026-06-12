import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Upgrades — create, drill-in & validation", () => {
  test("create → appears in list → delete", async ({ upgrades, sandbox }) => {
    await upgrades.open();
    const title = sandbox.name("Project");

    await upgrades.createProject(factories.upgrade(title));
    await upgrades.expectRow(title);

    await upgrades.deleteProject(title);
    await upgrades.expectNoRow(title);
  });

  test("empty project name is blocked", async ({ upgrades }) => {
    await upgrades.open();
    await upgrades.tryCreateEmpty();
    await upgrades.expectDialogStillOpen();
    await upgrades.app.closeDialog();
  });
});
