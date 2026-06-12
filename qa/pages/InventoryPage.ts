import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export interface InventoryInput {
  name: string;
  category?: string; // "Appliance" | "Furniture" | ...
  quantity?: string;
  brand?: string;
}

/** Inventory screen: create / edit / delete / filter / search. Labels are hardcoded English. */
export class InventoryPage extends BasePage {
  protected readonly route = "/inventory";

  private openCreate() {
    return this.page.getByRole("button", { name: /Add item/i }).first().click();
  }

  async addItem(input: InventoryInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/^Name/i, input.name);
    if (input.category) await this.selectInDialog(input.category, 0);
    if (input.quantity) await this.fillInDialog(/^Quantity$/i, input.quantity);
    if (input.brand) await this.fillInDialog(/^Brand$/i, input.brand);
    await this.submitDialog(/Add item/i);
    await this.app.expectDialogOpen(false);
  }

  async editItem(name: string, changes: { quantity?: string }): Promise<void> {
    await this.app.clickRowIcon(name, "lucide-pencil");
    await this.app.expectDialogOpen();
    if (changes.quantity) await this.fillInDialog(/^Quantity$/i, changes.quantity);
    await this.submitDialog(/Update/i);
    await this.app.expectDialogOpen(false);
  }

  async deleteItem(name: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(name, "lucide-trash2");
    await this.app.settle();
  }

  async filterCategory(label: string | RegExp): Promise<void> {
    await this.page.getByRole("combobox").first().click();
    await this.page.getByRole("option", { name: label }).first().click();
    await this.app.settle();
  }

  async search(query: string): Promise<void> {
    await this.page.getByPlaceholder(/Search items/i).fill(query);
    await this.app.settle(400);
  }

  async tryCreateEmpty(): Promise<void> {
    await this.openCreate();
    await this.submitDialog(/Add item/i);
  }

  async expectVisibleInTable(name: string): Promise<void> {
    await expect(this.page.getByRole("cell", { name }).first()).toBeVisible();
  }
}
