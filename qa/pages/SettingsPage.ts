import { expect, type Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Settings screen: section navigation + auto-save fields. Settings rows have no
 * action buttons, so we locate inputs by the nearest row that contains both the
 * label text and an input (a sibling of {@link Driver.rowFor}).
 */
export class SettingsPage extends BasePage {
  protected readonly route = "/settings";

  /** Click a section in the settings side-nav (e.g. "Regional", "Data"). */
  async openSection(label: string | RegExp): Promise<void> {
    await this.page.getByText(label, { exact: true }).first().click();
    await this.app.settle();
  }

  private fieldByLabel(label: string | RegExp): Locator {
    return this.page
      .locator("div")
      .filter({ hasText: label })
      .filter({ has: this.page.locator("input") })
      .last()
      .locator("input");
  }

  async readField(label: string | RegExp): Promise<string> {
    return (await this.fieldByLabel(label).inputValue()) ?? "";
  }

  /** Set a text field and blur it to trigger auto-save. */
  async setField(label: string | RegExp, value: string): Promise<void> {
    const field = this.fieldByLabel(label);
    await field.fill(value);
    await field.blur();
    await this.app.settle();
  }

  async expectSaved(): Promise<void> {
    await expect(this.page.getByText(/^Saved$/i).first()).toBeVisible();
  }
}
