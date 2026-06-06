/**
 * Reminder sweep — PURE logic, no DB. Given a property's data + reminder
 * preferences + "today", it returns the notifications that are due, each with a
 * stable `dedupeKey` so re-running the sweep never produces duplicates.
 *
 * The DB layer (server/db) is responsible for loading rows and mapping them to
 * the minimal shapes below; keeping this function pure makes the date/window
 * rules trivial to unit-test (see reminders.test.ts).
 */

import type { NotificationPayload } from "./types";

// ── Minimal input shapes (a subset of the Drizzle rows) ───────────────────────

export type ReminderPrefs = {
  reminderDaysBefore: number;
  remindExpenses: boolean;
  remindLoans: boolean;
  remindRepairs: boolean;
  remindCalendar: boolean;
};

export type DueExpense = {
  id: string;
  name: string;
  amount: number;
  date: string;
  nextDueDate?: string | null;
  isRecurring?: boolean | null;
  isPaid?: boolean | null;
};

export type DueLoan = {
  id: string;
  name: string;
  monthlyPayment?: number | null;
  nextPaymentDate?: string | null;
};

export type DueCalendarEvent = {
  id: string;
  title: string;
  date: string;
  reminderDaysBefore?: number | null;
};

export type WarrantyItem = {
  id: string;
  name: string;
  warrantyExpiry?: string | null;
};

export type StaleRepair = { id: string; label: string; days: number };

export type ReminderInput = {
  /** ISO date, YYYY-MM-DD. */
  today: string;
  prefs: ReminderPrefs;
  expenses?: DueExpense[];
  loans?: DueLoan[];
  calendarEvents?: DueCalendarEvent[];
  warrantyItems?: WarrantyItem[];
  /** Precomputed by the dashboard layer (getDashboardStats). */
  staleRepairs?: StaleRepair[];
};

// ── Date helpers (ISO strings compare lexicographically) ──────────────────────

/** Add `days` to an ISO date string, returning a new ISO date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when `target` falls within [today, today + leadDays] (inclusive). */
export function withinLeadWindow(
  today: string,
  target: string | null | undefined,
  leadDays: number
): boolean {
  if (!target) return false;
  return target >= today && target <= addDays(today, leadDays);
}

// ── Sweep ─────────────────────────────────────────────────────────────────────

export function collectDueReminders(
  input: ReminderInput
): NotificationPayload[] {
  const { today, prefs } = input;
  const lead = Math.max(0, prefs.reminderDaysBefore ?? 0);
  const out: NotificationPayload[] = [];

  if (prefs.remindExpenses) {
    for (const e of input.expenses ?? []) {
      // Overdue recurring, unpaid.
      if (e.isRecurring && !e.isPaid && e.date && e.date <= today) {
        out.push({
          dedupeKey: `expense-overdue:${e.id}:${e.date}`,
          category: "expense",
          title: "Expense overdue",
          body: `${e.name} (${e.amount}) was due on ${e.date}.`,
          url: "/expenses",
        });
      }
      // Upcoming, unpaid, with a scheduled next due date in the lead window.
      if (!e.isPaid && withinLeadWindow(today, e.nextDueDate, lead)) {
        out.push({
          dedupeKey: `expense-due:${e.id}:${e.nextDueDate}`,
          category: "expense",
          title: "Expense due soon",
          body: `${e.name} (${e.amount}) is due on ${e.nextDueDate}.`,
          url: "/expenses",
        });
      }
    }
  }

  if (prefs.remindLoans) {
    for (const l of input.loans ?? []) {
      if (withinLeadWindow(today, l.nextPaymentDate, lead)) {
        out.push({
          dedupeKey: `loan-due:${l.id}:${l.nextPaymentDate}`,
          category: "loan",
          title: "Loan payment due soon",
          body: `${l.name}${
            l.monthlyPayment ? ` (${l.monthlyPayment})` : ""
          } is due on ${l.nextPaymentDate}.`,
          url: "/loans",
        });
      }
    }
  }

  if (prefs.remindCalendar) {
    for (const c of input.calendarEvents ?? []) {
      // Per-event lead overrides the property default when set.
      const eventLead =
        c.reminderDaysBefore != null && c.reminderDaysBefore >= 0
          ? c.reminderDaysBefore
          : lead;
      if (withinLeadWindow(today, c.date, eventLead)) {
        out.push({
          dedupeKey: `calendar:${c.id}:${c.date}`,
          category: "calendar",
          title: "Upcoming event",
          body: `${c.title} on ${c.date}.`,
          url: "/calendar",
        });
      }
    }
  }

  // Warranty expiry has no dedicated pref flag; treat it as always-on since an
  // expiring warranty is high-value and not covered by the other toggles.
  for (const w of input.warrantyItems ?? []) {
    if (withinLeadWindow(today, w.warrantyExpiry, lead)) {
      out.push({
        dedupeKey: `warranty:${w.id}:${w.warrantyExpiry}`,
        category: "warranty",
        title: "Warranty expiring soon",
        body: `${w.name} warranty ends on ${w.warrantyExpiry}.`,
        url: "/inventory",
      });
    }
  }

  if (prefs.remindRepairs) {
    for (const r of input.staleRepairs ?? []) {
      // One reminder per day per repair; the delivery log's unique index keeps
      // a single same-day run from sending twice.
      out.push({
        dedupeKey: `repair-stale:${r.id}:${today}`,
        category: "repair",
        title: "Repair needs attention",
        body: `${r.label} has had no update for ${r.days}+ days.`,
        url: "/repairs",
      });
    }
  }

  return out;
}
