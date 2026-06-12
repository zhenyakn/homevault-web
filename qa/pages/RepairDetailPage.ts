import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Repair detail: manage quotes (add / select / pay), change status. Reached by
 * drilling in from {@link RepairsPage.openRepair}, so it has no direct route.
 *
 * Quote cards are collapsed by default (an "Expand" toggle reveals the footer
 * actions). Detail tests use a freshly-created repair with exactly one quote, so
 * page-level locators are unambiguous.
 */
export class RepairDetailPage extends BasePage {
  protected readonly route = "/repairs"; // detail id is dynamic; navigate via list

  /** Expand the (single) quote card if it's collapsed, to reveal its actions. */
  private async expandCard(): Promise<void> {
    const toggle = this.page.getByRole("button", { name: /^Expand$/i }).first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await this.app.settle(300);
    }
  }

  async addQuote(contractor: string, price: string): Promise<void> {
    await this.page.getByRole("button", { name: /Add quote/i }).first().click();
    await this.app.expectDialogOpen();
    // Quote dialog uses bare <Label>s → target inputs positionally.
    await this.fillDialogText(0, contractor);
    await this.fillDialogNumber(0, price);
    await this.submitDialog(/Add quote/i);
    await this.app.expectDialogOpen(false);
  }

  async selectQuote(): Promise<void> {
    await this.expandCard();
    await this.page.getByRole("button", { name: /^Select$/i }).first().click();
    await this.app.settle();
  }

  async logPayment(amount: string): Promise<void> {
    await this.expandCard();
    await this.page.getByRole("button", { name: /Log payment/i }).first().click();
    await this.app.expectDialogOpen();
    await this.fillDialogNumber(0, amount);
    await this.submitDialog(/Log payment/i);
    await this.app.expectDialogOpen(false);
  }

  /** Click a status step (e.g. "In Progress", "Completed") in the stepper. */
  async changeStatus(label: string | RegExp): Promise<void> {
    await this.page.getByRole("button", { name: label }).first().click();
    await this.app.settle();
  }

  async expectQuoteSelected(): Promise<void> {
    await expect(this.page.getByText(/Selected/i).first()).toBeVisible();
  }
}
