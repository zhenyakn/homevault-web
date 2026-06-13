import { expect, type Locator } from "@playwright/test";
import { Driver } from "../support/driver";

/**
 * Global search modal (⌘K / header search button). Lives in the layout, not a
 * route, so this isn't a BasePage — it's driven from whatever screen is open.
 * Exercises the full behaviour: min-chars hint, debounced query, result list,
 * no-results state, keyboard navigation and Escape-to-close.
 */
export class SearchModal {
  private readonly page;
  constructor(private readonly app: Driver) {
    this.page = app.page;
  }

  private dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  private input(): Locator {
    return this.dialog().getByPlaceholder(/Search expenses, repairs/i);
  }

  /** Open via the header search button (aria-label "Global Search"). */
  async open(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Global Search/i })
      .first()
      .click();
    await expect(this.input()).toBeVisible();
  }

  /** Open via the ⌘K keyboard shortcut. */
  async openWithKeyboard(): Promise<void> {
    await this.page.keyboard.press("Control+k");
    await expect(this.input()).toBeVisible();
  }

  async type(query: string): Promise<void> {
    await this.input().fill(query);
    // Debounce is 250ms; give the query + network a moment to settle.
    await this.app.settle(700);
  }

  async expectMinCharsHint(): Promise<void> {
    await expect(
      this.dialog().getByText(/Type at least 2 characters/i)
    ).toBeVisible();
  }

  async expectNoResults(): Promise<void> {
    await expect(this.dialog().getByText(/No results for/i)).toBeVisible();
  }

  /** A result row whose label contains `text`. */
  result(text: string | RegExp): Locator {
    return this.dialog().getByRole("option").filter({ hasText: text });
  }

  async expectResult(text: string | RegExp): Promise<void> {
    await expect(this.result(text).first()).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog()).toHaveCount(0);
  }

  async pressEscape(): Promise<void> {
    await this.input().press("Escape");
    await this.app.settle(300);
  }

  /** Arrow-down then Enter opens the highlighted result and closes the modal. */
  async arrowDownAndOpen(): Promise<void> {
    await this.input().press("ArrowDown");
    await this.input().press("Enter");
    await this.app.settle();
  }
}
