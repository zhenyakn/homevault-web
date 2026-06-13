import { BasePage } from "./BasePage";
import { today } from "../support/factories";

export interface CalendarEventInput {
  title: string;
  type?: string; // "Expense" | "Repair" | "Upgrade" | "Loan" | "Other"
  date?: string; // YYYY-MM-DD; defaults to today
}

/** Calendar screen: create event, then edit/delete via the day dialog. */
export class CalendarPage extends BasePage {
  protected readonly route = "/calendar";

  async addEvent(input: CalendarEventInput): Promise<void> {
    await this.page
      .getByRole("button", { name: /Add event/i })
      .first()
      .click();
    await this.app.expectDialogOpen();
    await this.fillInDialog(/Title/i, input.title);
    await this.fillInDialog(/Date/i, input.date ?? today());
    if (input.type) await this.selectInDialog(input.type, 0);
    await this.submitDialog(/Save event/i);
    await this.app.expectDialogOpen(false);
  }

  /** Open the day dialog for a given day-of-month (defaults to today). */
  async openDay(day = new Date().getDate()): Promise<void> {
    await this.page.getByText(String(day), { exact: true }).first().click();
    await this.app.expectDialogOpen();
  }

  /** Delete an event from the open day dialog (native confirm). */
  async deleteEventFromDay(title: string): Promise<void> {
    this.app.acceptConfirm();
    await this.dialog()
      .getByRole("button", { name: /Delete|Remove/i })
      .first()
      .click();
    await this.app.settle();
  }

  async tryCreateEmpty(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Add event/i })
      .first()
      .click();
    await this.submitDialog(/Save event/i);
  }

  // ── Month navigation ────────────────────────────────────────────────────────

  async nextMonth(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Next month/i })
      .first()
      .click();
    await this.app.settle(300);
  }

  async prevMonth(): Promise<void> {
    await this.page
      .getByRole("button", { name: /Previous month/i })
      .first()
      .click();
    await this.app.settle(300);
  }

  /** Assert the "<Month> <year>" grid header is showing. */
  async expectMonthLabel(label: string): Promise<void> {
    await this.app.expectVisible(label);
  }
}
