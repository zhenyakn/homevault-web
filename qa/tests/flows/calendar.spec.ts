import { test } from "../../fixtures";
import { factories } from "../../support/factories";

test.describe("Calendar — create event & validation", () => {
  test("create an event for today → it appears", async ({
    calendar,
    sandbox,
  }) => {
    await calendar.open();
    const title = sandbox.name("Event");

    await calendar.addEvent(factories.calendarEvent(title));
    await calendar.expectRow(title);
    // The event is removed by sandbox API teardown.
  });

  test("empty title is blocked", async ({ calendar }) => {
    await calendar.open();
    await calendar.tryCreateEmpty();
    await calendar.expectDialogStillOpen();
    await calendar.app.closeDialog();
  });
});
