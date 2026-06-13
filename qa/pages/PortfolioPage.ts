import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Portfolio ("/portfolio") — one card per property with quick stats, plus the
 * "Add new property" affordances. With a single seeded property the sidebar nav
 * entry is hidden, but the route is always reachable directly (deep-link), which
 * is what we drive here.
 */
export class PortfolioPage extends BasePage {
  protected readonly route = "/portfolio";

  async expectHeading(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: /^Portfolio$/ }).first()
    ).toBeVisible();
  }

  /** The active property card carries an "Active" badge. */
  async expectActiveBadge(): Promise<void> {
    await expect(this.page.getByText(/^Active$/).first()).toBeVisible();
  }

  /** Open the add-property dialog via the dashed "Add new property" CTA. */
  async openAddProperty(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Add new property|Add property/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
  }
}
