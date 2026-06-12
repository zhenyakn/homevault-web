import { expect, type Locator, type Page } from "@playwright/test";
import { Driver } from "../support/driver";

/**
 * Base for all page objects. Wraps the {@link Driver} (the Selenium-style action
 * vocabulary) and adds dialog-scoped form helpers so a create/edit dialog's
 * fields are never confused with same-labelled fields on the page behind it.
 *
 * Subclasses encapsulate per-screen knowledge (routes, triggers, row layout) and
 * expose intention-revealing methods (addLoan, deleteRepair, …) so specs read
 * like a manual test script.
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(readonly app: Driver) {
    this.page = app.page;
  }

  /** Hash route this screen lives at, e.g. "/loans". */
  protected abstract readonly route: string;

  /** Navigate to the screen. */
  async open(): Promise<void> {
    await this.app.goto(this.route);
  }

  // ── Dialog-scoped form helpers ──────────────────────────────────────────────

  /** The open Radix dialog (scopes all the helpers below). */
  protected dialog(): Locator {
    return this.app.dialog();
  }

  /** Fill a labelled field inside the open dialog. */
  protected async fillInDialog(
    label: string | RegExp,
    value: string
  ): Promise<void> {
    await this.dialog().getByLabel(label).first().fill(value);
  }

  /** Fill a field by placeholder inside the open dialog (for unlabeled inputs). */
  protected async fillByPlaceholderInDialog(
    placeholder: string | RegExp,
    value: string
  ): Promise<void> {
    await this.dialog().getByPlaceholder(placeholder).first().fill(value);
  }

  /** Pick an option from a Radix <Select> inside the dialog (by trigger index). */
  protected async selectInDialog(
    option: string | RegExp,
    triggerIndex = 0
  ): Promise<void> {
    await this.dialog().getByRole("combobox").nth(triggerIndex).click();
    await this.page.getByRole("option", { name: option }).first().click();
  }

  /**
   * Fill the Nth text input in the dialog. Some dialogs (detail-page quote /
   * option / item forms, the payment dialog) use bare `<Label>`s with no
   * `htmlFor`, so `getByLabel` can't associate them — target inputs positionally.
   */
  protected async fillDialogText(index: number, value: string): Promise<void> {
    await this.dialog()
      .locator(
        'input:not([type="number"]):not([type="date"]):not([type="time"])'
      )
      .nth(index)
      .fill(value);
  }

  /** Fill the Nth number input in the dialog (for unlabeled numeric fields). */
  protected async fillDialogNumber(
    index: number,
    value: string
  ): Promise<void> {
    await this.dialog().locator('input[type="number"]').nth(index).fill(value);
  }

  /** Click the dialog's submit button by name and wait for it to close. */
  protected async submitDialog(name: string | RegExp): Promise<void> {
    await this.dialog().getByRole("button", { name }).first().click();
    await this.app.settle();
  }

  // ── Shared assertions ───────────────────────────────────────────────────────

  /** Assert a record with this name is visible in the list. */
  async expectRow(name: string | RegExp): Promise<void> {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  /** Assert no record with this name remains. */
  async expectNoRow(name: string | RegExp): Promise<void> {
    await expect(this.page.getByText(name)).toHaveCount(0);
  }

  /** Assert a success toast appeared (optionally matching text). */
  async expectSuccess(text?: string | RegExp): Promise<void> {
    await this.app.expectToast(text, "success");
  }

  /** Assert an error toast appeared (optionally matching text). */
  async expectError(text?: string | RegExp): Promise<void> {
    await this.app.expectErrorToast(text);
  }

  /** Assert a create/edit dialog is still open (e.g. a validation guard blocked submit). */
  async expectDialogStillOpen(): Promise<void> {
    await this.app.expectDialogOpen(true);
  }
}
