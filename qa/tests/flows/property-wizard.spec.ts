import { test, expect } from "../../fixtures";

/**
 * Add-Property wizard — the multi-step flow that replaced the single-field add
 * dialog. These drive the UI only (open, branch by mode, navigate, gate, close)
 * and never create a property, so the seeded demo data is left untouched.
 * Transactional creation + linked records are covered by the server integration
 * test (server/db/properties.integration.test.ts).
 */
test.describe("Add-property wizard", () => {
  test("opens with the three mode choices and cancels cleanly", async ({
    portfolio,
    app,
  }) => {
    await portfolio.open();
    await portfolio.openAddProperty();
    const d = app.dialog();
    await expect(d.getByText(/How did you get this property/i)).toBeVisible();
    await expect(d.getByText(/Bought & rent it out/i)).toBeVisible();
    await expect(d.getByText(/Bought for myself/i)).toBeVisible();
    await expect(d.getByText(/I rent it/i)).toBeVisible();

    await d.getByRole("button", { name: /^Cancel$/ }).click();
    await app.expectDialogOpen(false);
  });

  test("tenant branch reaches lease fields, not purchase", async ({
    portfolio,
    app,
  }) => {
    await portfolio.open();
    await portfolio.openAddProperty();
    const d = app.dialog();

    await d.getByText(/I rent it/i).click();
    await d.getByRole("button", { name: /Next/i }).click(); // → basics
    await expect(d.getByText(/The basics/i)).toBeVisible();
    await d.getByRole("textbox").first().fill("QA Tenant Flat"); // Name
    await d.getByRole("button", { name: /Next/i }).click(); // → financials

    // Tenant flow shows the lease/rent fields, never a purchase price.
    await expect(d.getByText(/Your rent & lease/i)).toBeVisible();
    await expect(
      d.getByText(/As a tenant, there's no purchase or mortgage/i)
    ).toBeVisible();

    await app.closeDialog();
    await app.expectDialogOpen(false);
  });

  test("a name is required before leaving the basics step", async ({
    portfolio,
    app,
  }) => {
    await portfolio.open();
    await portfolio.openAddProperty();
    const d = app.dialog();

    await d.getByText(/Bought for myself/i).click();
    await d.getByRole("button", { name: /Next/i }).click(); // → basics
    await expect(d.getByText(/The basics/i)).toBeVisible();
    // Clicking Next with an empty name does not advance.
    await d.getByRole("button", { name: /Next/i }).click();
    await expect(d.getByText(/The basics/i)).toBeVisible();

    await app.closeDialog();
    await app.expectDialogOpen(false);
  });
});
