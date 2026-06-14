import { test, expect } from "../../fixtures";

test.describe("Apartment Search — hunt, compare & pick", () => {
  test("create search → add candidate → advance stage", async ({
    apartmentSearch,
    sandbox,
  }) => {
    await apartmentSearch.open();
    const searchName = sandbox.name("Rental hunt");

    // New search drops you straight into its (empty) candidate list.
    await apartmentSearch.createSearch({ name: searchName, type: "Rent" });
    await apartmentSearch.expectRow(searchName);

    const candidate = sandbox.name("Sea view 2BR");
    await apartmentSearch.addCandidate({ title: candidate, price: "6500" });
    await apartmentSearch.expectRow(candidate);

    // Drill into the candidate and move it down the pipeline.
    await apartmentSearch.openCandidate(candidate);
    await apartmentSearch.advanceStage(/Viewed/i);
    await apartmentSearch.expectStage(/Viewed/i);
  });

  test("pick a winner → converts into a tracked property", async ({
    apartmentSearch,
    sandbox,
    page,
  }) => {
    await apartmentSearch.open();
    const searchName = sandbox.name("Buy hunt");
    await apartmentSearch.createSearch({ name: searchName, type: "Buy" });

    const candidate = sandbox.name("The one");
    await apartmentSearch.addCandidate({ title: candidate, price: "2400000" });
    await apartmentSearch.openCandidate(candidate);

    await apartmentSearch.convertToProperty();
    // Conversion routes to the portfolio with the new property active, and the
    // candidate's "Make this my home" action is no longer on screen.
    await apartmentSearch.app.expectRoute("/portfolio");
    await expect(
      page.getByRole("button", { name: /Make this my home/i })
    ).toHaveCount(0);
  });

  test("empty search name disables create", async ({
    apartmentSearch,
    page,
  }) => {
    await apartmentSearch.open();
    await page
      .getByRole("button", { name: /New search/i })
      .first()
      .click();
    await apartmentSearch.app.expectDialogOpen();
    // Create stays disabled until a name is entered (guards empty submits).
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: /Create/i })
    ).toBeDisabled();
    await dialog.getByPlaceholder(/near the office/i).fill("A place");
    await expect(dialog.getByRole("button", { name: /Create/i })).toBeEnabled();
    await apartmentSearch.app.closeDialog();
  });
});
