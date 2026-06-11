/**
 * Real-MySQL integration tests for the notification DB layer + notify()
 * end-to-end. Skipped unless TEST_DATABASE_URL points at a throwaway MySQL:
 *
 *   TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/homevault_test pnpm test
 *
 * They validate the actual SQL/Drizzle calls (prefs, delivery log + idempotency,
 * in-app feed, link codes) that unit tests with a mocked DB can't reach.
 */

import { describe, it, expect, beforeAll } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("notifications DB integration (real MySQL)", () => {
  let dbn: typeof import("./notifications");
  let notifyMod: typeof import("../notifications");
  let userId: number;

  beforeAll(async () => {
    // Point the (lazily-read) DB url at the throwaway database, then migrate.
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });

    const { getDb } = await import("./client");
    const schema = await import("../../drizzle/schema");
    dbn = await import("./notifications");
    notifyMod = await import("../notifications");

    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `it-${Date.now()}`,
      email: "it@example.com",
      name: "IT",
    });
    userId = (res as any).insertId as number;
  });

  it("prefs: defaults, override, and enabled set", async () => {
    const prefs = await dbn.getPrefs(userId);
    expect(prefs.inapp).toBe(true);
    expect(prefs.telegram).toBe(false);

    await dbn.setPref(userId, "telegram", true);
    await dbn.setPref(userId, "email", false);
    await dbn.setPref(userId, "telegram", true); // upsert path (no duplicate row)

    const enabled = await dbn.getEnabledChannels(userId);
    expect(enabled.has("inapp")).toBe(true);
    expect(enabled.has("telegram")).toBe(true);
    expect(enabled.has("email")).toBe(false);
  });

  it("delivery log: record, idempotency, feed, mark read", async () => {
    const dedupeKey = `exp:1:${Date.now()}`;
    expect(await dbn.isDeliverySent(userId, "inapp", dedupeKey)).toBe(false);

    await dbn.recordDelivery({
      userId,
      channel: "inapp",
      category: "expense",
      title: "T",
      body: "B",
      url: "/x",
      dedupeKey,
      status: "sent",
    });

    expect(await dbn.isDeliverySent(userId, "inapp", dedupeKey)).toBe(true);

    const feed = await dbn.listInApp(userId);
    const row = feed.find(r => r.dedupeKey === dedupeKey);
    expect(row).toBeTruthy();

    await dbn.markRead(row!.id, userId);
    const unread = await dbn.listInApp(userId, { unreadOnly: true });
    expect(unread.some(r => r.id === row!.id)).toBe(false);
  });

  it("feed is scoped to the active property; system notifications are global", async () => {
    const stamp = Date.now();
    // A reminder for property 1, a reminder for property 2, and a system row.
    await dbn.recordDelivery({
      userId,
      propertyId: 1,
      channel: "inapp",
      category: "expense",
      title: "P1",
      body: "B",
      dedupeKey: `p1:${stamp}`,
      status: "sent",
    });
    await dbn.recordDelivery({
      userId,
      propertyId: 2,
      channel: "inapp",
      category: "expense",
      title: "P2",
      body: "B",
      dedupeKey: `p2:${stamp}`,
      status: "sent",
    });
    await dbn.recordDelivery({
      userId,
      propertyId: null,
      channel: "inapp",
      category: "system",
      title: "SYS",
      body: "B",
      dedupeKey: `sys:${stamp}`,
      status: "sent",
    });

    const onP1 = await dbn.listInApp(userId, { propertyId: 1 });
    const keys1 = new Set(onP1.map(r => r.dedupeKey));
    expect(keys1.has(`p1:${stamp}`)).toBe(true);
    expect(keys1.has(`sys:${stamp}`)).toBe(true); // system is account-wide
    expect(keys1.has(`p2:${stamp}`)).toBe(false); // other property hidden

    const onP2 = await dbn.listInApp(userId, { propertyId: 2 });
    const keys2 = new Set(onP2.map(r => r.dedupeKey));
    expect(keys2.has(`p2:${stamp}`)).toBe(true);
    expect(keys2.has(`p1:${stamp}`)).toBe(false);

    // markAllRead on property 1 must not clear property 2's unread reminder.
    await dbn.markAllRead(userId, { propertyId: 1 });
    const p2Unread = await dbn.listInApp(userId, {
      propertyId: 2,
      unreadOnly: true,
    });
    expect(p2Unread.some(r => r.dedupeKey === `p2:${stamp}`)).toBe(true);
  });

  it("telegram link code is single-use", async () => {
    const code = await dbn.createTelegramLinkCode(userId);
    expect(await dbn.consumeTelegramLinkCode(code)).toBe(userId);
    expect(await dbn.consumeTelegramLinkCode(code)).toBeUndefined();
  });

  it("notify() delivers in-app once and is idempotent on re-run", async () => {
    for (const ch of [
      "push",
      "email",
      "webpush",
      "telegram",
      "whatsapp",
    ] as const) {
      await dbn.setPref(userId, ch, false);
    }
    await dbn.setPref(userId, "inapp", true);

    const payload = {
      dedupeKey: `e2e:${Date.now()}`,
      category: "system" as const,
      titleKey: "test.title",
      bodyKey: "test.body",
    };

    const first = await notifyMod.notify(userId, payload);
    expect(first.find(r => r.channel === "inapp")?.status).toBe("sent");

    const second = await notifyMod.notify(userId, payload);
    expect(second.find(r => r.channel === "inapp")?.status).toBe("skipped");
  });
});
