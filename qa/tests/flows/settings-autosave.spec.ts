import { test, expect } from "../../fixtures";

/**
 * Settings autosave — the page has no Save button; text fields persist on blur.
 * Exercises the Household → Display name path (profile update, "Saved" toast)
 * and restores the original value in a `finally` so shared profile state is
 * never left mutated. (Property → Nickname autosave moved to the Portfolio page;
 * see portfolio.spec.ts.)
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
});
