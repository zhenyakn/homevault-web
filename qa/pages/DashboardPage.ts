import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Dashboard (home "/") — the bento grid of summary cards. Read-only landing
 * page: it surfaces KPI cards (Open items, Monthly spend, Needs attention,
 * Upcoming) and inline navigation shortcuts (Full calendar →, Loans →,
 * Upgrades →, Review quotes →, Update status →). We assert the cards render and
 * the shortcuts route, rather than the exact (data-dependent) figures.
 */
export class DashboardPage extends BasePage {
  protected readonly route = "/";

  /** One of the three time-of-day greetings is the H1. */
  async expectGreeting(): Promise<void> {
    await expect(
      this.page
        .getByRole("heading", {
          name: /Good (morning|afternoon|evening)/i,
          level: 1,
        })
        .first()
    ).toBeVisible();
  }

  /** Assert a card label (uppercase section title) is present. */
  async expectCard(label: string | RegExp): Promise<void> {
    await expect(this.page.getByText(label).first()).toBeVisible();
  }

  /** Click an inline shortcut button by its visible label and assert the route. */
  async followShortcut(
    name: string | RegExp,
    expectedRoute: string
  ): Promise<void> {
    await this.page.getByRole("button", { name }).first().click();
    await this.app.settle();
    await this.app.expectRoute(expectedRoute);
  }
}
