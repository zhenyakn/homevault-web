import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Forge push primitive used by the push channel.
vi.mock("../../_core/notification", () => ({ notifyOwner: vi.fn() }));

import { notifyOwner } from "../../_core/notification";
import { inAppChannel } from "./inapp";
import { pushChannel } from "./push";
import { emailChannel } from "./email";
import { webPushChannel } from "./webpush";
import { telegramChannel } from "./telegram";
import { whatsappChannel } from "./whatsapp";
import type { NotificationPayload, Recipient } from "../types";

const payload: NotificationPayload = {
  dedupeKey: "k",
  category: "system",
  title: "Hello",
  body: "World",
  url: "/x",
};
const recipient: Recipient = {
  id: 1,
  email: "a@b.com",
  telegramChatId: "555",
  whatsappPhone: "+100",
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("canDeliverTo / isConfigured guards", () => {
  it("in-app is always available and delivers as a no-op", async () => {
    expect(inAppChannel.isConfigured()).toBe(true);
    expect(inAppChannel.canDeliverTo(recipient)).toBe(true);
    await expect(
      inAppChannel.send(recipient, payload)
    ).resolves.toBeUndefined();
  });

  it("email needs a recipient email; SMTP unset → not configured in test", () => {
    expect(emailChannel.isConfigured()).toBe(false);
    expect(emailChannel.canDeliverTo({ id: 1, email: "x@y.z" })).toBe(true);
    expect(emailChannel.canDeliverTo({ id: 1 })).toBe(false);
  });

  it("telegram needs a chat id; token unset → not configured in test", () => {
    expect(telegramChannel.isConfigured()).toBe(false);
    expect(telegramChannel.canDeliverTo({ id: 1, telegramChatId: "1" })).toBe(
      true
    );
    expect(telegramChannel.canDeliverTo({ id: 1 })).toBe(false);
  });

  it("web push needs VAPID; unset → not configured in test", () => {
    expect(webPushChannel.isConfigured()).toBe(false);
  });

  it("whatsapp is a placeholder: never configured, send throws", async () => {
    expect(whatsappChannel.isConfigured()).toBe(false);
    expect(whatsappChannel.canDeliverTo({ id: 1, whatsappPhone: "+1" })).toBe(
      true
    );
    await expect(whatsappChannel.send(recipient, payload)).rejects.toThrow();
  });
});

describe("push channel", () => {
  it("calls notifyOwner with the payload", async () => {
    vi.mocked(notifyOwner).mockResolvedValue(true);
    await pushChannel.send(recipient, payload);
    expect(notifyOwner).toHaveBeenCalledWith({
      title: "Hello",
      content: "World",
    });
  });

  it("throws when Forge does not accept", async () => {
    vi.mocked(notifyOwner).mockResolvedValue(false);
    await expect(pushChannel.send(recipient, payload)).rejects.toThrow();
  });
});

describe("telegram channel send", () => {
  it("POSTs sendMessage with chat id + combined text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telegramChannel.send(recipient, payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse((init as any).body);
    expect(body.chat_id).toBe("555");
    expect(body.text).toBe("Hello\nWorld");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "bad request",
      })
    );
    await expect(telegramChannel.send(recipient, payload)).rejects.toThrow(
      /Telegram sendMessage failed/
    );
  });
});
