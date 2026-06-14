import { expect, type Locator } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Settings screen: section navigation + auto-save fields. Settings rows have no
 * action buttons, so we locate inputs by the nearest row that contains both the
 * label text and an input (a sibling of {@link Driver.rowFor}).
 */
export class SettingsPage extends BasePage {
  protected readonly route = "/settings";

  /** Click a section in the settings side-nav (e.g. "Regional", "Data"). The
   *  nav entries are <button>s; target the role so we don't accidentally hit the
   *  identically-worded group heading <p>. */
  async openSection(label: string): Promise<void> {
    // Scope to the settings content: the header notification bell also exposes
    // an accessible name of "Notifications", so an unscoped match would open the
    // bell popover instead of the section.
    await this.page
      .locator("#main-content")
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
    await this.app.settle();
  }

  /** Expand a collapsible category by its header (e.g. "Connected services",
   *  "Notification channels"). These categories collapse by default, so their
   *  inner controls aren't in the DOM until the header is toggled open. No-op if
   *  already expanded. */
  async expandCategory(label: string | RegExp): Promise<void> {
    const header = this.page
      .locator("#main-content")
      .getByRole("button", { name: label })
      .first();
    await expect(header).toBeVisible();
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
      await this.app.settle(300);
    }
  }

  /** Assert the active section rendered by its SectionHeader <h2>. */
  async expectSectionHeading(name: string | RegExp): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name, level: 2 }).first()
    ).toBeVisible();
  }

  // ── Appearance ──────────────────────────────────────────────────────────────

  /** Click a theme tile (Light / Dark / System) in the Appearance section.
   *  Scoped to the main content so we hit the section tile, not the identically
   *  -labelled sidebar-footer theme toggle. */
  async setTheme(label: "Light" | "Dark" | "System"): Promise<void> {
    await this.page
      .locator("#main-content")
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
    await this.app.settle(300);
  }

  /** Assert the <html> element reflects the chosen theme. The app toggles only a
   *  `dark` class (light = its absence), so assert presence/absence accordingly. */
  async expectThemeClass(cls: "light" | "dark"): Promise<void> {
    const html = this.page.locator("html");
    if (cls === "dark") await expect(html).toHaveClass(/\bdark\b/);
    else await expect(html).not.toHaveClass(/\bdark\b/);
  }

  /** The language toggle group exposes English / Hebrew / Russian. */
  async expectLanguageOptions(): Promise<void> {
    for (const lang of ["English", "עברית", "Русский"]) {
      await expect(
        this.page.getByText(lang, { exact: true }).first()
      ).toBeVisible();
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  /** Click "Download JSON" and return the resolved Playwright download. */
  async downloadJson() {
    const waitForDownload = this.page.waitForEvent("download", {
      timeout: 15_000,
    });
    await this.page
      .getByRole("button", { name: /Download JSON/i })
      .first()
      .click();
    return waitForDownload;
  }

  /** Open the "Delete all records" type-to-confirm dialog. */
  async openDeleteAll(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Delete all…/i })
      .first()
      .click();
    await expect(this.page.getByRole("alertdialog")).toBeVisible();
  }

  alertDialog(): Locator {
    return this.page.getByRole("alertdialog");
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
