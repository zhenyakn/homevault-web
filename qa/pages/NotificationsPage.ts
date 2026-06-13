import { expect, type Locator } from "@playwright/test";
import { Driver } from "../support/driver";

/**
 * Notification center — header bell + popover feed. Lives in the layout chrome,
 * so it's driven from whatever screen is open (not a route). The seeded demo
 * data may or may not produce "needs attention" items, so the assertions accept
 * either the populated feed or the "all caught up" empty state.
 */
export class NotificationsPage {
  private readonly page;
  constructor(private readonly app: Driver) {
    this.page = app.page;
  }

  private popover(): Locator {
    // Radix Popover content renders with role="dialog".
    return this.page.getByRole("dialog");
  }

  async openBell(): Promise<void> {
    await this.page
      .getByRole("button", { name: /^Notifications$/ })
      .first()
      .click();
    await expect(this.popover()).toBeVisible();
  }

  /** The popover shows either the feed header or the empty state. */
  async expectOpen(): Promise<void> {
    await expect(
      this.popover()
        .getByText(/Notifications|You're all caught up/)
        .first()
    ).toBeVisible();
  }

  /** The "Notification settings" footer link routes to /settings/notifications. */
  async openSettings(): Promise<void> {
    await this.popover()
      .getByText(/Notification settings/i)
      .first()
      .click();
    await this.app.settle();
  }

  /** "Mark all read" is only shown when there are unread items. */
  async markAllReadIfPresent(): Promise<boolean> {
    const btn = this.popover().getByRole("button", { name: /Mark all read/i });
    if ((await btn.count()) === 0) return false;
    await btn.first().click();
    await this.app.settle();
    return true;
  }
}
