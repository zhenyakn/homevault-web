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
import { eq } from "drizzle-orm";

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

  it("feed is scoped to the active property (NULL rows stay global)", async () => {
    const stamp = Date.now();
    // Two property-scoped rows + one global (NULL) row.
    await dbn.recordDelivery({
      userId,
      propertyId: 100,
      channel: "inapp",
      category: "expense",
      title: "P100",
      body: "B",
      dedupeKey: `p100:${stamp}`,
      status: "sent",
    });
    await dbn.recordDelivery({
      userId,
      propertyId: 200,
      channel: "inapp",
      category: "expense",
      title: "P200",
      body: "B",
      dedupeKey: `p200:${stamp}`,
      status: "sent",
    });
    await dbn.recordDelivery({
      userId,
      propertyId: null,
      channel: "inapp",
      category: "system",
      title: "Global",
      body: "B",
      dedupeKey: `glob:${stamp}`,
      status: "sent",
    });

    const onP100 = await dbn.listInApp(userId, { propertyId: 100 });
    const keys = new Set(onP100.map(r => r.dedupeKey));
    // Sees its own property + the global row, but not the other property's.
    expect(keys.has(`p100:${stamp}`)).toBe(true);
    expect(keys.has(`glob:${stamp}`)).toBe(true);
    expect(keys.has(`p200:${stamp}`)).toBe(false);

    // Without a propertyId the feed is unscoped (all properties).
    const all = await dbn.listInApp(userId);
    const allKeys = new Set(all.map(r => r.dedupeKey));
    expect(allKeys.has(`p200:${stamp}`)).toBe(true);
  });

  it("prune removes read notifications past the cutoff but keeps unread", async () => {
    const { getDb } = await import("./client");
    const schema = await import("../../drizzle/schema");
    const db = await getDb();
    const stamp = Date.now();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    // Read 40 days ago → pruned.
    await dbn.recordDelivery({
      userId,
      channel: "inapp",
      category: "system",
      title: "old-read",
      body: "B",
      dedupeKey: `prune-old:${stamp}`,
      status: "sent",
    });
    // Unread but ancient → kept (clock starts at readAt, which is NULL).
    await dbn.recordDelivery({
      userId,
      channel: "inapp",
      category: "system",
      title: "old-unread",
      body: "B",
      dedupeKey: `prune-unread:${stamp}`,
      status: "sent",
    });
    // Backdate the first row's readAt so it falls outside the window.
    await db
      .update(schema.notificationLog)
      .set({ readAt: old })
      .where(eq(schema.notificationLog.dedupeKey, `prune-old:${stamp}`));

    await dbn.pruneReadNotifications(30);

    const feed = await dbn.listInApp(userId);
    const keys = new Set(feed.map(r => r.dedupeKey));
    expect(keys.has(`prune-old:${stamp}`)).toBe(false); // read + old → gone
    expect(keys.has(`prune-unread:${stamp}`)).toBe(true); // unread → kept
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
