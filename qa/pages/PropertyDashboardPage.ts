import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Property dashboard ("/property") — a read-only summary of the active
 * property's identity + physical details, with an "Edit in Settings" shortcut.
 */
export class PropertyDashboardPage extends BasePage {
  protected readonly route = "/property";

  async expectDetailsCard(): Promise<void> {
    await expect(
      this.page.getByText(/Property Details/i).first()
    ).toBeVisible();
  }

  /** The "Edit in Settings" link routes to /settings. */
  async editInSettings(): Promise<void> {
    await this.page
      .getByRole("link", { name: /Edit in Settings/i })
      .first()
      .click();
    await this.app.settle();
    await this.app.expectRoute("/settings");
  }
}
