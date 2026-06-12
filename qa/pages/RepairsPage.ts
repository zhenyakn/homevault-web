import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export interface RepairInput {
  title: string;
  priority?: string; // "Urgent" | "High" | "Medium" | "Low"
}

/**
 * Repairs list: log / open (drill-in) / delete. Delete uses a Radix
 * **AlertDialog** (not native confirm); the title guard is silent (no toast).
 */
export class RepairsPage extends BasePage {
  protected readonly route = "/repairs";

  private openCreate() {
    return this.page.getByRole("button", { name: /Log repair/i }).first().click();
  }

  async logRepair(input: RepairInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Description/i, input.title);
    if (input.priority) await this.selectInDialog(input.priority, 0);
    await this.submitDialog(/Log repair/i);
    await this.app.expectDialogOpen(false);
  }

  /** Drill into a repair's detail page by clicking its title. */
  async openRepair(title: string): Promise<void> {
    await this.page.getByText(title).first().click();
    await this.app.settle();
  }

  async deleteRepair(title: string): Promise<void> {
    await this.app.clickRowIcon(title, "lucide-trash2");
    await expect(this.app.alertDialog()).toBeVisible();
    await this.app.alertDialog().getByRole("button", { name: /^Delete$/i }).click();
    await this.app.settle();
  }

  /** Open create and submit with no title — the silent guard should block it. */
  async tryCreateEmpty(): Promise<void> {
    await this.openCreate();
    await this.submitDialog(/Log repair/i);
  }
}
