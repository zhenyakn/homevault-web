import { describe, it, expect } from "vitest";
import {
  addDays,
  withinLeadWindow,
  collectDueReminders,
  type ReminderInput,
  type ReminderPrefs,
} from "./reminders";

const allOn: ReminderPrefs = {
  reminderDaysBefore: 3,
  remindExpenses: true,
  remindLoans: true,
  remindRepairs: true,
  remindCalendar: true,
};

function base(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return { today: "2026-06-06", prefs: allOn, ...overrides };
}

describe("addDays", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("handles zero and is stable", () => {
    expect(addDays("2026-06-06", 0)).toBe("2026-06-06");
  });
});

describe("withinLeadWindow", () => {
  it("includes today and the far edge, excludes outside", () => {
    expect(withinLeadWindow("2026-06-06", "2026-06-06", 3)).toBe(true);
    expect(withinLeadWindow("2026-06-06", "2026-06-09", 3)).toBe(true);
    expect(withinLeadWindow("2026-06-06", "2026-06-10", 3)).toBe(false);
    expect(withinLeadWindow("2026-06-06", "2026-06-05", 3)).toBe(false);
  });
  it("returns false for missing target", () => {
    expect(withinLeadWindow("2026-06-06", null, 3)).toBe(false);
    expect(withinLeadWindow("2026-06-06", undefined, 3)).toBe(false);
  });
});

describe("collectDueReminders — expenses", () => {
  it("flags overdue recurring unpaid expenses", () => {
    const r = collectDueReminders(
      base({
        expenses: [
          { id: "e1", name: "Tax", amount: 4200, date: "2026-06-01", isRecurring: true, isPaid: false },
        ],
      })
    );
    expect(r).toHaveLength(1);
    expect(r[0].dedupeKey).toBe("expense-overdue:e1:2026-06-01");
    expect(r[0].category).toBe("expense");
  });

  it("excludes paid and non-recurring from overdue", () => {
    const r = collectDueReminders(
      base({
        expenses: [
          { id: "p", name: "Paid", amount: 1, date: "2026-06-01", isRecurring: true, isPaid: true },
          { id: "n", name: "OneOff", amount: 1, date: "2026-06-01", isRecurring: false, isPaid: false },
        ],
      })
    );
    expect(r).toHaveLength(0);
  });

  it("flags upcoming expenses by nextDueDate within the lead window", () => {
    const r = collectDueReminders(
      base({
        expenses: [
          { id: "u", name: "Water", amount: 100, date: "2026-05-01", nextDueDate: "2026-06-08", isPaid: false },
          { id: "far", name: "Later", amount: 1, date: "2026-05-01", nextDueDate: "2026-06-20", isPaid: false },
        ],
      })
    );
    expect(r.map(x => x.dedupeKey)).toEqual(["expense-due:u:2026-06-08"]);
  });

  it("respects the remindExpenses toggle", () => {
    const r = collectDueReminders(
      base({
        prefs: { ...allOn, remindExpenses: false },
        expenses: [
          { id: "e1", name: "Tax", amount: 1, date: "2026-06-01", isRecurring: true, isPaid: false },
        ],
      })
    );
    expect(r).toHaveLength(0);
  });
});

describe("collectDueReminders — loans", () => {
  it("flags loan payments due within the window and respects the toggle", () => {
    const input = base({
      loans: [{ id: "l1", name: "Mortgage", monthlyPayment: 6150, nextPaymentDate: "2026-06-07" }],
    });
    expect(collectDueReminders(input)[0].dedupeKey).toBe("loan-due:l1:2026-06-07");
    expect(
      collectDueReminders({ ...input, prefs: { ...allOn, remindLoans: false } })
    ).toHaveLength(0);
  });
});

describe("collectDueReminders — calendar", () => {
  it("uses a per-event reminderDaysBefore over the property default", () => {
    // Property lead is 3 (event is 8 days out → outside), but the event asks for 10.
    const r = collectDueReminders(
      base({
        calendarEvents: [
          { id: "c1", title: "Inspection", date: "2026-06-14", reminderDaysBefore: 10 },
        ],
      })
    );
    expect(r).toHaveLength(1);
    expect(r[0].dedupeKey).toBe("calendar:c1:2026-06-14");
  });

  it("falls back to the property default when the event has none", () => {
    const r = collectDueReminders(
      base({
        calendarEvents: [{ id: "c2", title: "Far", date: "2026-06-20" }],
      })
    );
    expect(r).toHaveLength(0);
  });
});

describe("collectDueReminders — warranty (always on)", () => {
  it("flags warranties expiring within the window", () => {
    const r = collectDueReminders(
      base({ warrantyItems: [{ id: "w1", name: "Fridge", warrantyExpiry: "2026-06-08" }] })
    );
    expect(r[0].dedupeKey).toBe("warranty:w1:2026-06-08");
    expect(r[0].category).toBe("warranty");
  });
});

describe("collectDueReminders — stale repairs", () => {
  it("flags stale repairs only when remindRepairs is on", () => {
    const input = base({ staleRepairs: [{ id: "r1", label: "Roof leak", days: 6 }] });
    const r = collectDueReminders(input);
    expect(r[0].dedupeKey).toBe("repair-stale:r1:2026-06-06");
    expect(
      collectDueReminders({ ...input, prefs: { ...allOn, remindRepairs: false } })
    ).toHaveLength(0);
  });
});

describe("collectDueReminders — empty", () => {
  it("returns an empty array with no data", () => {
    expect(collectDueReminders(base())).toEqual([]);
  });
});
