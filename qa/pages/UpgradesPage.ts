import { BasePage } from "./BasePage";

export interface UpgradeInput {
  title: string;
  budget?: string;
  description?: string;
}

/** Upgrades (projects) list: create / open (drill-in) / delete. */
export class UpgradesPage extends BasePage {
  protected readonly route = "/upgrades";

  // Trigger button is "New project"; the dialog's submit button is "Create project".
  private openCreate() {
    return this.page
      .getByRole("button", { name: /New project/i })
      .first()
      .click();
  }

  async createProject(input: UpgradeInput): Promise<void> {
    await this.openCreate();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Project name/i, input.title);
    if (input.budget) await this.fillInDialog(/Budget/i, input.budget);
    if (input.description)
      await this.fillInDialog(/Description/i, input.description);
    await this.submitDialog(/Create project/i);
    await this.app.expectDialogOpen(false);
  }

  async openProject(title: string): Promise<void> {
    await this.page.getByText(title).first().click();
    await this.app.settle();
  }

  async deleteProject(title: string): Promise<void> {
    this.app.acceptConfirm();
    await this.app.clickRowIcon(title, "lucide-trash2");
    await this.app.settle();
  }

  async tryCreateEmpty(): Promise<void> {
    await this.openCreate();
    await this.submitDialog(/Create project/i);
  }
}
