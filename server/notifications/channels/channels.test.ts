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
import { _resetNotificationConfigForTests } from "../config";
import { _resetIntegrationsConfigForTests } from "../../_core/integrationsConfig";
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
  whatsappPhone: "+1 (555) 010-2030",
};

const NOTIF_ENV_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "TELEGRAM_BOT_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_API_VERSION",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
];
function clearNotifEnv() {
  for (const v of NOTIF_ENV_VARS) delete process.env[v];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearNotifEnv();
  _resetNotificationConfigForTests();
  _resetIntegrationsConfigForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearNotifEnv();
  _resetNotificationConfigForTests();
  _resetIntegrationsConfigForTests();
});

describe("canDeliverTo / isConfigured guards (nothing configured)", () => {
  it("in-app is always available and delivers as a no-op", async () => {
    expect(inAppChannel.isConfigured()).toBe(true);
    expect(inAppChannel.canDeliverTo(recipient)).toBe(true);
    await expect(
      inAppChannel.send(recipient, payload)
    ).resolves.toBeUndefined();
  });

  it("email needs a recipient email; SMTP unset → not configured", () => {
    expect(emailChannel.isConfigured()).toBe(false);
    expect(emailChannel.canDeliverTo({ id: 1, email: "x@y.z" })).toBe(true);
    expect(emailChannel.canDeliverTo({ id: 1 })).toBe(false);
  });

  it("telegram needs a chat id; token unset → not configured", () => {
    expect(telegramChannel.isConfigured()).toBe(false);
    expect(telegramChannel.canDeliverTo({ id: 1, telegramChatId: "1" })).toBe(
      true
    );
    expect(telegramChannel.canDeliverTo({ id: 1 })).toBe(false);
  });

  it("web push needs VAPID; unset → not configured", () => {
    expect(webPushChannel.isConfigured()).toBe(false);
  });

  it("whatsapp needs Cloud API creds; unset → not configured", () => {
    expect(whatsappChannel.isConfigured()).toBe(false);
    expect(whatsappChannel.canDeliverTo({ id: 1, whatsappPhone: "+1" })).toBe(
      true
    );
    expect(whatsappChannel.canDeliverTo({ id: 1 })).toBe(false);
  });

  it("push needs Forge creds; unset → not configured", () => {
    expect(pushChannel.isConfigured()).toBe(false);
  });
});

describe("isConfigured reflects runtime config", () => {
  it("email becomes configured once host + from are set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "noreply@example.com";
    expect(emailChannel.isConfigured()).toBe(true);
  });

  it("telegram becomes configured once a token is set", () => {
    process.env.TELEGRAM_BOT_TOKEN = "abc";
    expect(telegramChannel.isConfigured()).toBe(true);
  });

  it("webpush becomes configured once both VAPID keys are set", () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    expect(webPushChannel.isConfigured()).toBe(true);
  });

  it("whatsapp becomes configured once phone id + token are set", () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    expect(whatsappChannel.isConfigured()).toBe(true);
  });

  it("push becomes configured once Forge URL + key are set", () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key";
    expect(pushChannel.isConfigured()).toBe(true);
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
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "tok123";
  });

  it("POSTs sendMessage with chat id + combined text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await telegramChannel.send(recipient, payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/bottok123/sendMessage");
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

describe("whatsapp channel send", () => {
  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "999";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_API_VERSION = "v21.0";
  });

  it("POSTs a text message to the Cloud API with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await whatsappChannel.send(recipient, payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/999/messages");
    expect((init as any).headers.authorization).toBe("Bearer wa-token");
    const body = JSON.parse((init as any).body);
    expect(body.messaging_product).toBe("whatsapp");
    // Phone number is normalised to digits only (E.164 without punctuation).
    expect(body.to).toBe("15550102030");
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Hello\nWorld");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "invalid token",
      })
    );
    await expect(whatsappChannel.send(recipient, payload)).rejects.toThrow(
      /WhatsApp send failed/
    );
  });
});
