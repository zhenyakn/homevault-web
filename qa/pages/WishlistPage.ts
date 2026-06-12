import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export interface WishlistInput {
  name: string;
  estimatedCost?: string;
  priority?: string; // "Low" | "Medium" | "High"
}

/** Wishlist screen: create / edit / delete / mark-purchased / move-to-upgrades. */
export class WishlistPage extends BasePage {
  protected readonly route = "/wishlist";

  private openCreate() {
    return this.page.getByRole("button", { name: /Add item/i }).first().click();
  }

  async addItem(input: WishlistInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Label/i, input.name);
    if (input.estimatedCost) await this.fillInDialog(/Estimated cost/i, input.estimatedCost);
    if (input.priority) await this.selectInDialog(input.priority, 0);
    await this.submitDialog(/Create/i);
    await this.app.expectDialogOpen(false);
  }

  async editItem(name: string, changes: { estimatedCost?: string }): Promise<void> {
    await this.app.clickRowIcon(name, "lucide-pencil");
    await this.app.expectDialogOpen();
    if (changes.estimatedCost) await this.fillInDialog(/Estimated cost/i, changes.estimatedCost);
    await this.submitDialog(/Update/i);
    await this.app.expectDialogOpen(false);
  }

  async markPurchased(name: string): Promise<void> {
    await this.app.rowFor(name).getByRole("button", { name: /Mark as purchased/i }).first().click();
    await this.app.settle();
  }

  async moveToUpgrades(name: string): Promise<void> {
    await this.app.rowFor(name).getByRole("button", { name: /Move to upgrades/i }).first().click();
    await this.app.settle();
  }

  async deleteItem(name: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(name, "lucide-trash2");
    await this.app.settle();
  }

  /**
   * Submit create with no name. The name input is `required`, so the browser's
   * native form validation blocks submit and the dialog stays open (no toast).
   */
  async tryCreateEmpty(): Promise<void> {
    await this.openCreate();
    await this.fillInDialog(/Estimated cost/i, "100");
    await this.dialog().getByRole("button", { name: /Create/i }).first().click();
    await this.app.settle(400);
  }

  async expectPurchased(name: string): Promise<void> {
    await expect(this.app.rowFor(name).getByText(/Purchased/i).first()).toBeVisible();
  }
}
