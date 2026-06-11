import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Driver — a small, Selenium-flavoured wrapper around a Playwright `Page`.
 *
 * It gives QA flows a stable, intention-revealing vocabulary (navigate, click,
 * type, select, assert, screenshot) so individual specs read like a manual test
 * script and don't have to know about Radix/shadcn DOM quirks.
 *
 * The app has no `data-testid`s, so selectors lean on accessible roles + visible
 * (i18n) text — the same things a human tester sees on screen.
 */
export class Driver {
  constructor(
    readonly page: Page,
    private readonly baseURL: string,
  ) {}

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Go to a hash route, e.g. "/expenses" → "/#/expenses", and wait for idle. */
  async goto(route: string): Promise<void> {
    const hash = route.startsWith("/#") ? route : `/#${route}`;
    await this.page.goto(`${this.baseURL}${hash}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await this.settle();
  }

  /** Click a left-nav / sidebar item by its visible label (e.g. "Expenses"). */
  async clickNav(name: string): Promise<void> {
    await this.page
      .getByRole("button", { name, exact: true })
      .first()
      .click();
    await this.settle();
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  /** Click any button by accessible name (text or aria-label). */
  async clickButton(name: string | RegExp): Promise<void> {
    await this.page.getByRole("button", { name }).first().click();
  }

  /** Click anything matching visible text. */
  async clickText(text: string | RegExp): Promise<void> {
    await this.page.getByText(text).first().click();
  }

  /** Type into a field located by its <label>. Clears any existing value. */
  async fill(label: string | RegExp, value: string): Promise<void> {
    const field = this.page.getByLabel(label).first();
    await field.fill(value);
  }

  /** Type into a field located by placeholder text. */
  async fillByPlaceholder(placeholder: string | RegExp, value: string): Promise<void> {
    await this.page.getByPlaceholder(placeholder).first().fill(value);
  }

  /**
   * Choose a value from a Radix/shadcn <Select>. These render as a `combobox`
   * trigger that opens a listbox of `option`s — not a native <select>.
   *
   * @param trigger  accessible name of the trigger, or its 0-based index when
   *                 several selects share the page (default: first select).
   * @param option   visible text of the option to pick.
   */
  async select(option: string | RegExp, trigger: string | number = 0): Promise<void> {
    const combo =
      typeof trigger === "number"
        ? this.page.getByRole("combobox").nth(trigger)
        : this.page.getByRole("combobox", { name: trigger });
    await combo.click();
    await this.page.getByRole("option", { name: option }).first().click();
  }

  /** Toggle a checkbox located by its label. */
  async check(label: string | RegExp, checked = true): Promise<void> {
    const box = this.page.getByLabel(label).first();
    if (checked) await box.check();
    else await box.uncheck();
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  /** Assert visible text is present somewhere on the page. */
  async expectVisible(text: string | RegExp): Promise<void> {
    await expect(this.page.getByText(text).first()).toBeVisible();
  }

  /** Assert the current hash route. */
  async expectRoute(route: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`#${route.replace(/[/]/g, "\\/")}(\\b|$)`));
  }

  /** Locator escape hatch for assertions the helpers don't cover. */
  locator(selector: string): Locator {
    return this.page.locator(selector);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Capture a full-page screenshot into the configured artifacts dir. */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `qa/artifacts/${name}.png`,
      fullPage: true,
    });
  }

  /** Let React Query refetch / animations finish before we look or click. */
  async settle(ms = 800): Promise<void> {
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(ms);
  }
}
