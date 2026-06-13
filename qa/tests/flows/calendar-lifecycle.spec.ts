import { test } from "../../fixtures";
import { factories } from "../../support/factories";

/**
 * Calendar event lifecycle — create an event for today, open today's day cell
 * to reveal the day dialog listing it, then delete it from there (native
 * confirm) and assert it's gone. Complements calendar.spec (which only covers
 * create + validation) with the open-day + delete path.
 */
test.describe("Calendar — event lifecycle via the day dialog", () => {
  test("create → open day → delete", async ({ calendar, sandbox }) => {
    await calendar.open();
    const title = sandbox.name("Appt");

    await calendar.addEvent(factories.calendarEvent(title));
    await calendar.expectRow(title);

    // Open today's day dialog; the event is listed inside it.
    await calendar.openDay();
    await calendar.app.expectVisible(title);

    await calendar.deleteEventFromDay(title);
    await calendar.expectNoRow(title);
  });
});
