import { test, expect } from "../../fixtures";

/**
 * Settings autosave — the page has no Save button; text fields persist on blur.
 * We exercise two distinct autosave paths and restore the original value in a
 * `finally` so the shared property/profile state is never left mutated:
 *  - Household → Display name (profile update, "Saved" toast),
 *  - Property → Nickname (property update, "Saved" section indicator).
 */
test.describe("Settings — field autosave (set & restore)", () => {
  test("household display name saves on blur and round-trips", async ({
    settings,
    sandbox,
  }) => {
    await settings.open();
    await settings.openSection("Household");

    const original = await settings.readField("Display name");
    const updated = sandbox.name("User");
    try {
      await settings.setField("Display name", updated);
      await settings.expectSaved();
      expect(await settings.readField("Display name")).toBe(updated);
    } finally {
      await settings.setField("Display name", original);
    }
  });

  test("property nickname saves on blur and round-trips", async ({
    settings,
    sandbox,
  }) => {
    await settings.open();
    await settings.openSection("Property");

    const original = await settings.readField("Nickname");
    const updated = sandbox.name("Nick");
    try {
      await settings.setField("Nickname", updated);
      await settings.expectSaved();
      expect(await settings.readField("Nickname")).toBe(updated);
    } finally {
      await settings.setField("Nickname", original);
    }
  });
});
