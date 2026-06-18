/**
 * Reminder scheduler — an in-process node-cron job that runs a daily sweep.
 * The sweep loads each property's data, reuses the pure `collectDueReminders`
 * logic, and delivers via `notify`. Idempotency lives in the delivery log, so a
 * repeated run on the same day never double-sends.
 */

import cron from "node-cron";
import { logger } from "../_core/logger";
import { notify } from "./index";
import { collectDueReminders } from "./reminders";
import { todayInTz } from "./time";
import { getAllProperties } from "../db/properties";
import { getExpenses } from "../db/expenses";
import { getLoans } from "../db/loans";
import { getCalendarEvents } from "../db/calendar";
import { getInventoryItems } from "../db/inventory";
import { getDashboardStats } from "../db/dashboard";

export type SweepResult = { properties: number; reminders: number };

/**
 * Run the reminder sweep across every property. `notifyFn` is injectable for
 * tests; defaults to the real dispatcher.
 */
export async function runReminderSweep(
  opts: { notifyFn?: typeof notify } = {}
): Promise<SweepResult> {
  const notifyFn = opts.notifyFn ?? notify;
  const properties = await getAllProperties();
  let reminders = 0;

  for (const property of properties) {
    const userId = property.userId;
    // Property-scoped reads are now tenant-scoped. Skip any property that hasn't
    // been assigned a tenant yet (shouldn't happen after the Stage-1 backfill).
    const tenantId = property.tenantId;
    if (tenantId == null) continue;
    const today = todayInTz(property.timezone);

    const [expenses, loans, calendarEvents, inventory, stats] =
      await Promise.all([
        getExpenses(tenantId, property.id),
        getLoans(tenantId, property.id),
        getCalendarEvents(property.id),
        getInventoryItems(tenantId, property.id),
        getDashboardStats(tenantId, property.id),
      ]);

    const due = collectDueReminders({
      today,
      prefs: {
        reminderDaysBefore: property.reminderDaysBefore ?? 3,
        remindExpenses: property.remindExpenses ?? true,
        remindLoans: property.remindLoans ?? true,
        remindRepairs: property.remindRepairs ?? true,
        remindCalendar: property.remindCalendar ?? true,
      },
      expenses,
      loans,
      calendarEvents,
      warrantyItems: inventory.map(i => ({
        id: i.id,
        name: i.name,
        warrantyExpiry: i.warrantyExpiry,
      })),
      // Dashboard flags repairs not updated in 5+ days; it doesn't expose the
      // exact age, so report the threshold.
      staleRepairs: stats.staleRepairs.map(r => ({
        id: r.id,
        label: r.label,
        days: 5,
      })),
      // Lease-end reminders only apply to rental properties (tenant or
      // rented-out); owner-occupied properties have no lease.
      lease:
        property.propertyMode === "rented" ||
        property.propertyMode === "owned_rented"
          ? { id: property.id, leaseEnd: property.leaseEnd }
          : null,
    });

    for (const payload of due) {
      try {
        await notifyFn(userId, payload, { propertyId: property.id });
        reminders++;
      } catch (err) {
        logger.warn(
          { err, dedupeKey: payload.dedupeKey },
          "[reminders] failed to dispatch a reminder"
        );
      }
    }
  }

  return { properties: properties.length, reminders };
}

let started = false;

/** Schedule the daily sweep (08:00 server time). Safe to call once at boot. */
export function startReminderScheduler(): void {
  if (started) return;
  if (process.env.NODE_ENV === "test") return;
  started = true;
  cron.schedule("0 8 * * *", () => {
    runReminderSweep()
      .then(r => logger.info(r, "[reminders] daily sweep complete"))
      .catch(err => logger.error({ err }, "[reminders] sweep failed"));
  });
  logger.info("[reminders] daily sweep scheduled for 08:00");
}
