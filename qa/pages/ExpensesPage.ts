import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export interface ExpenseInput {
  name: string;
  amount: string;
  category?: string; // resolved English category label, e.g. "Utilities"
  notes?: string;
}

/** Expenses screen: create / edit / delete / mark-paid / filter. */
export class ExpensesPage extends BasePage {
  protected readonly route = "/expenses";

  private openCreate() {
    return this.page
      .getByRole("button", { name: /Add expense/i })
      .first()
      .click();
  }

  async addExpense(input: ExpenseInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Description/i, input.name);
    await this.fillInDialog(/Amount/i, input.amount);
    if (input.category) await this.selectInDialog(input.category, 0);
    if (input.notes) await this.fillInDialog(/Notes/i, input.notes);
    await this.submitDialog(/Add expense/i);
    await this.app.expectDialogOpen(false);
  }

  async editExpense(name: string, changes: { amount?: string }): Promise<void> {
    await this.app.clickRowIcon(name, "lucide-pencil");
    await this.app.expectDialogOpen();
    if (changes.amount) await this.fillInDialog(/Amount/i, changes.amount);
    await this.submitDialog(/Update/i);
    await this.app.expectDialogOpen(false);
  }

  async deleteExpense(name: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(name, "lucide-trash2");
    await this.app.settle();
  }

  async markPaid(name: string): Promise<void> {
    await this.app.clickRowIcon(name, "lucide-check");
    await this.app.settle();
  }

  /** Try to submit the create dialog with the given (possibly invalid) values. */
  async tryCreateInvalid(input: Partial<ExpenseInput>): Promise<void> {
    await this.openCreate();
    if (input.name) await this.fillInDialog(/Description/i, input.name);
    if (input.amount) await this.fillInDialog(/Amount/i, input.amount);
    await this.submitDialog(/Add expense/i);
  }

  async filterMonth(label: string | RegExp): Promise<void> {
    await this.page.getByRole("combobox").nth(0).click();
    await this.page.getByRole("option", { name: label }).first().click();
    await this.app.settle();
  }

  async search(query: string): Promise<void> {
    await this.page
      .getByPlaceholder(/Search/i)
      .first()
      .fill(query);
    await this.app.settle(400);
  }

  async expectStat(label: string | RegExp): Promise<void> {
    await expect(this.page.getByText(label).first()).toBeVisible();
  }
}
