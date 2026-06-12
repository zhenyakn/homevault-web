import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Upgrade detail: manage vendor options (add / select / pay) and items
 * (add / toggle purchased). Reached via {@link UpgradesPage.openProject}.
 *
 * Two layers of progressive disclosure: options sit in a collapsed
 * "Vendors & Options" accordion, and each option card is itself collapsed (an
 * "Expand" toggle reveals select/pay actions). Detail tests use a fresh project
 * with one option / one item, so page-level locators are unambiguous.
 */
export class UpgradeDetailPage extends BasePage {
  protected readonly route = "/upgrades"; // detail id is dynamic

  /** Expand the Vendors & Options accordion (guarded on the add button's visibility). */
  private async expandOptions(): Promise<void> {
    const addBtn = this.page
      .getByRole("button", { name: /Add quote/i })
      .first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      await this.page
        .getByRole("button", { name: /Vendors & Options/i })
        .first()
        .click();
      await this.app.settle(300);
    }
  }

  /** Expand the (single) option card if collapsed, to reveal its actions. */
  private async expandCard(): Promise<void> {
    const toggle = this.page.getByRole("button", { name: /^Expand$/i }).first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await this.app.settle(300);
    }
  }

  async addOption(name: string, price: string): Promise<void> {
    await this.expandOptions();
    await this.page
      .getByRole("button", { name: /Add quote/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillDialogText(0, name);
    await this.fillDialogNumber(0, price);
    await this.submitDialog(/Add option/i);
    await this.app.expectDialogOpen(false);
  }

  async selectOption(): Promise<void> {
    await this.expandOptions();
    await this.expandCard();
    await this.page
      .getByRole("button", { name: /^Select$/i })
      .first()
      .click();
    await this.app.settle();
  }

  async logPayment(amount: string): Promise<void> {
    await this.expandOptions();
    await this.expandCard();
    await this.page
      .getByRole("button", { name: /Log payment/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillDialogNumber(0, amount);
    await this.submitDialog(/Log payment/i);
    await this.app.expectDialogOpen(false);
  }

  async addItem(name: string): Promise<void> {
    await this.page
      .getByRole("button", { name: /Add item/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillDialogText(0, name); // item dialog uses a bare <Label>
    await this.submitDialog(/Add item/i);
    await this.app.expectDialogOpen(false);
  }

  /** Toggle the (single) item between Pending and Purchased by clicking its badge. */
  async toggleItemPurchased(): Promise<void> {
    await this.page
      .getByText(/^Pending$|^Purchased$/i)
      .first()
      .click();
    await this.app.settle();
  }

  async expectOptionSelected(): Promise<void> {
    await this.expandOptions();
    await expect(this.page.getByText(/Selected/i).first()).toBeVisible();
  }
}
