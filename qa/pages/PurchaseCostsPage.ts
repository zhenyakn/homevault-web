import { BasePage } from "./BasePage";

export interface PurchaseCostInput {
  name: string;
  amount: string;
  category?: string; // "Tax" | "Legal" | ...
  date?: string;
}

/** Purchase Costs screen: create / edit / delete (grouped-by-category list). */
export class PurchaseCostsPage extends BasePage {
  protected readonly route = "/purchase-costs";

  private openCreate() {
    return this.page.getByRole("button", { name: /Add cost/i }).first().click();
  }

  async addCost(input: PurchaseCostInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Label/i, input.name);
    await this.fillInDialog(/Amount/i, input.amount);
    if (input.category) await this.selectInDialog(input.category, 0);
    await this.submitDialog(/Save/i);
    await this.app.expectDialogOpen(false);
  }

  async editCost(name: string, changes: { amount?: string }): Promise<void> {
    await this.app.clickRowIcon(name, "lucide-pencil");
    await this.app.expectDialogOpen();
    if (changes.amount) await this.fillInDialog(/Amount/i, changes.amount);
    await this.submitDialog(/Update/i);
    await this.app.expectDialogOpen(false);
  }

  async deleteCost(name: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(name, "lucide-trash2");
    await this.app.settle();
  }

  async tryCreateEmpty(): Promise<void> {
    await this.openCreate();
    await this.fillInDialog(/Amount/i, "100");
    await this.submitDialog(/Save/i);
  }
}
