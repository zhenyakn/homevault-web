import { describe, it, expect, vi } from "vitest";
import { dispatchNotification, type DispatchDeps } from "./dispatch";
import type {
  ChannelKey,
  NotificationChannel,
  NotificationPayload,
  Recipient,
} from "./types";

const recipient: Recipient = {
  id: 1,
  email: "a@b.com",
  telegramChatId: "123",
};

const payload: NotificationPayload = {
  dedupeKey: "expense-due:e1:2026-06-08",
  category: "expense",
  title: "Expense due soon",
  body: "Water (100) is due.",
};

function fakeChannel(
  key: ChannelKey,
  opts: {
    configured?: boolean;
    canDeliver?: boolean;
    send?: () => Promise<void>;
  } = {}
): NotificationChannel & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(opts.send ?? (async () => {}));
  return {
    key,
    isConfigured: () => opts.configured ?? true,
    canDeliverTo: () => opts.canDeliver ?? true,
    send,
  };
}

function deps(
  channels: NotificationChannel[],
  enabled: ChannelKey[],
  extra: Partial<DispatchDeps> = {}
): DispatchDeps {
  return { channels, enabledChannels: new Set(enabled), ...extra };
}

describe("dispatchNotification", () => {
  it("delivers to enabled, configured channels with a destination", async () => {
    const email = fakeChannel("email");
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([email], ["email"])
    );
    expect(email.send).toHaveBeenCalledOnce();
    expect(results).toEqual([{ channel: "email", status: "sent" }]);
  });

  it("ignores channels the user has not enabled", async () => {
    const email = fakeChannel("email");
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([email], []) // none enabled
    );
    expect(email.send).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("isolates per-channel failures — one throwing does not stop others", async () => {
    const ok = fakeChannel("inapp");
    const bad = fakeChannel("email", {
      send: async () => {
        throw new Error("smtp down");
      },
    });
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([ok, bad], ["inapp", "email"])
    );
    expect(ok.send).toHaveBeenCalledOnce();
    const byChannel = Object.fromEntries(results.map(r => [r.channel, r]));
    expect(byChannel.inapp.status).toBe("sent");
    expect(byChannel.email.status).toBe("failed");
    expect(byChannel.email.reason).toBe("smtp down");
  });

  it("skips unconfigured channels without sending", async () => {
    const email = fakeChannel("email", { configured: false });
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([email], ["email"])
    );
    expect(email.send).not.toHaveBeenCalled();
    expect(results[0]).toEqual({
      channel: "email",
      status: "skipped",
      reason: "not-configured",
    });
  });

  it("skips channels with no destination for the recipient", async () => {
    const wa = fakeChannel("whatsapp", { canDeliver: false });
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([wa], ["whatsapp"])
    );
    expect(wa.send).not.toHaveBeenCalled();
    expect(results[0].reason).toBe("no-destination");
  });

  it("skips already-sent (idempotent) and does not call send", async () => {
    const email = fakeChannel("email");
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([email], ["email"], { isAlreadySent: () => true })
    );
    expect(email.send).not.toHaveBeenCalled();
    expect(results[0]).toEqual({
      channel: "email",
      status: "skipped",
      reason: "already-sent",
    });
  });

  it("records every attempt with the dedupeKey", async () => {
    const record = vi.fn();
    const ok = fakeChannel("inapp");
    const bad = fakeChannel("email", {
      send: async () => {
        throw new Error("x");
      },
    });
    await dispatchNotification(
      recipient,
      payload,
      deps([ok, bad], ["inapp", "email"], { record })
    );
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "inapp",
        status: "sent",
        dedupeKey: payload.dedupeKey,
      })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", status: "failed" })
    );
  });

  it("does not let a failing recorder break delivery", async () => {
    const email = fakeChannel("email");
    const results = await dispatchNotification(
      recipient,
      payload,
      deps([email], ["email"], {
        record: () => {
          throw new Error("db down");
        },
      })
    );
    expect(results[0].status).toBe("sent");
  });
});
