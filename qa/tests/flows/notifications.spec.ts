import { test } from "../../fixtures";

/**
 * Notification center — the header bell popover. The seeded demo data may or may
 * not surface "needs attention" rows, so we assert the popover opens to either
 * the feed or the "all caught up" state, that "Mark all read" works when shown,
 * and that the footer settings link deep-links into the notifications settings.
 */
test.describe("Notifications — bell popover", () => {
  test("opens the feed (or empty state)", async ({ app, notifications }) => {
    await app.goto("/");
    await notifications.openBell();
    await notifications.expectOpen();
  });

  test("'Mark all read' clears the unread badge when present", async ({
    app,
    notifications,
  }) => {
    await app.goto("/");
    await notifications.openBell();
    // Either clears unread, or there was nothing to clear — both are valid.
    await notifications.markAllReadIfPresent();
    await notifications.expectOpen();
  });

  test("footer link opens notification settings", async ({
    app,
    notifications,
  }) => {
    await app.goto("/");
    await notifications.openBell();
    await notifications.openSettings();
    await app.expectRoute("/settings/notifications");
  });
});
