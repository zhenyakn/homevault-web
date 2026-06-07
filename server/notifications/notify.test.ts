import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer so notify()'s wiring is testable without a database.
vi.mock("../db/notifications", () => ({
  getNotificationRecipient: vi.fn(),
  getEnabledChannels: vi.fn(),
  isDeliverySent: vi.fn(),
  recordDelivery: vi.fn(),
}));

import { notify, notifyTest } from "./index";
import {
  getNotificationRecipient,
  getEnabledChannels,
  isDeliverySent,
  recordDelivery,
} from "../db/notifications";
import type { NotificationChannel, ReminderMessage } from "./types";

const recipient = {
  id: 1,
  name: "A",
  email: "a@b.com",
  telegramChatId: "123",
  whatsappPhone: null,
  language: "en",
};

// notify() takes a language-independent message and resolves it per recipient.
const message: ReminderMessage = {
  dedupeKey: "k1",
  category: "expense",
  titleKey: "expenseDue.title",
  bodyKey: "expenseDue.body",
  params: { name: "Water", amount: 100, date: "2026-06-08" },
  url: "/x",
};

function fake(
  key: NotificationChannel["key"],
  opts: { configured?: boolean; canDeliver?: boolean } = {}
): NotificationChannel & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(async () => {});
  return {
    key,
    isConfigured: () => opts.configured ?? true,
    canDeliverTo: () => opts.canDeliver ?? true,
    send,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNotificationRecipient).mockResolvedValue(recipient as any);
  vi.mocked(isDeliverySent).mockResolvedValue(false);
  vi.mocked(recordDelivery).mockResolvedValue(undefined as any);
});

describe("notify()", () => {
  it("delivers to enabled channels and records the outcome", async () => {
    vi.mocked(getEnabledChannels).mockResolvedValue(new Set(["email"]));
    const ch = fake("email");

    const res = await notify(1, message, { channels: [ch] });

    expect(ch.send).toHaveBeenCalledOnce();
    expect(res).toEqual([{ channel: "email", status: "sent" }]);
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        channel: "email",
        status: "sent",
        category: "expense",
        title: "Expense due soon",
        body: "Water (100) is due on 2026-06-08.",
        url: "/x",
        dedupeKey: "k1",
      })
    );
  });

  it("does not persist skipped outcomes (avoids daily noise)", async () => {
    vi.mocked(getEnabledChannels).mockResolvedValue(new Set(["email"]));
    const ch = fake("email", { configured: false });

    const res = await notify(1, message, { channels: [ch] });

    expect(ch.send).not.toHaveBeenCalled();
    expect(res[0].status).toBe("skipped");
    expect(recordDelivery).not.toHaveBeenCalled();
  });

  it("is idempotent — already-sent is skipped and not re-recorded", async () => {
    vi.mocked(getEnabledChannels).mockResolvedValue(new Set(["email"]));
    vi.mocked(isDeliverySent).mockResolvedValue(true);
    const ch = fake("email");

    const res = await notify(1, message, { channels: [ch] });

    expect(ch.send).not.toHaveBeenCalled();
    expect(res[0]).toEqual({
      channel: "email",
      status: "skipped",
      reason: "already-sent",
    });
    expect(recordDelivery).not.toHaveBeenCalled();
  });

  it("persists failures", async () => {
    vi.mocked(getEnabledChannels).mockResolvedValue(new Set(["email"]));
    const ch = fake("email");
    ch.send.mockRejectedValueOnce(new Error("smtp down"));

    const res = await notify(1, message, { channels: [ch] });

    expect(res[0].status).toBe("failed");
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        status: "failed",
        reason: "smtp down",
      })
    );
  });

  it("no-ops when the user has no recipient row", async () => {
    vi.mocked(getNotificationRecipient).mockResolvedValue(undefined as any);
    const res = await notify(1, message, { channels: [fake("email")] });
    expect(res).toEqual([]);
    expect(recordDelivery).not.toHaveBeenCalled();
  });
});

describe("notifyTest()", () => {
  it("delivers a test via the in-app channel and records it", async () => {
    const res = await notifyTest(1, "inapp");
    expect(res[0].status).toBe("sent");
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "inapp",
        status: "sent",
        category: "system",
        dedupeKey: expect.stringMatching(/^test:inapp:/),
      })
    );
  });

  it("reports skipped (and records nothing) for an unconfigured channel", async () => {
    // SMTP is unset in the test env, so the email channel is not configured.
    const res = await notifyTest(1, "email");
    expect(res[0].status).toBe("skipped");
    expect(recordDelivery).not.toHaveBeenCalled();
  });
});
