import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock every collaborator so the router can be exercised without a DB. We only
// care that the admin config endpoints are correctly gated and forward to the
// config layer with the right shape.
vi.mock("./notifications/config", () => ({
  getNotificationConfig: vi.fn(() => ({ vapidPublicKey: "PUBKEY" })),
  getNotificationConfigStatus: vi.fn(() => ({
    email: { configured: false, fromEnv: false },
    telegram: { configured: false, fromEnv: false },
    webpush: { configured: false, fromEnv: false },
    whatsapp: { configured: false, fromEnv: false },
  })),
  saveNotificationConfig: vi.fn(async () => {}),
}));
vi.mock("./_core/integrationsConfig", () => ({
  getIntegrationsConfigStatus: vi.fn(() => ({
    push: { configured: false, fromEnv: false, apiUrl: null, apiKeySet: false },
    general: {
      publicBaseUrl: null,
      publicBaseUrlFromEnv: false,
      webhookSecretSet: false,
      webhookSecretFromEnv: false,
    },
  })),
  saveIntegrationsConfig: vi.fn(async () => {}),
  getPublicBaseUrl: vi.fn(() => ""),
}));
vi.mock("./bot/telegram", () => ({
  getBotUsername: vi.fn(async () => null),
  resetBot: vi.fn(),
  syncTelegramWebhook: vi.fn(async () => ({
    ok: true,
    url: "https://home/api/bot/telegram",
  })),
  getTelegramWebhookInfo: vi.fn(async () => null),
}));
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: "GEN_PUB",
      privateKey: "GEN_PRIV",
    })),
  },
}));
vi.mock("./notifications", () => ({
  notifyTest: vi.fn(async () => [{ channel: "email", status: "sent" }]),
}));
vi.mock("./notifications/scheduler", () => ({
  runReminderSweep: vi.fn(async () => ({ properties: 0, reminders: 0 })),
}));
vi.mock("./db/notifications", () => ({
  getNotificationRecipient: vi.fn(async () => ({ id: 1, email: null })),
  getPrefs: vi.fn(),
}));
vi.mock("./db/entitlements", () => ({
  hasCapability: vi.fn(async () => true),
}));

import { notificationRouter } from "./notificationRouter";
import {
  getNotificationConfigStatus,
  saveNotificationConfig,
} from "./notifications/config";
import {
  getIntegrationsConfigStatus,
  saveIntegrationsConfig,
} from "./_core/integrationsConfig";
import { resetBot, syncTelegramWebhook } from "./bot/telegram";

const adminCtx = {
  user: { id: 1, globalRole: "superadmin" },
  tenantId: null,
  // Used to derive the webhook base URL when no public URL is configured.
  req: { protocol: "https", get: () => "home" },
} as any;
const userCtx = {
  user: { id: 2, globalRole: "user" },
  tenantId: null,
} as any;

beforeEach(() => vi.clearAllMocks());

describe("notificationRouter admin config endpoints", () => {
  it("getChannelConfig merges notification + integrations status for an admin", async () => {
    const caller = notificationRouter.createCaller(adminCtx);
    const status = await caller.getChannelConfig();
    expect(getNotificationConfigStatus).toHaveBeenCalledOnce();
    expect(getIntegrationsConfigStatus).toHaveBeenCalledOnce();
    expect(status.email.configured).toBe(false);
    // Push (Forge) + general sections come from the integrations config.
    expect(status.push.configured).toBe(false);
    expect(status.general.webhookSecretSet).toBe(false);
  });

  it("getChannelConfig is forbidden for a non-admin", async () => {
    const caller = notificationRouter.createCaller(userCtx);
    await expect(caller.getChannelConfig()).rejects.toThrow();
    expect(getNotificationConfigStatus).not.toHaveBeenCalled();
  });

  it("saveChannelConfig routes channel + integration sections to the right stores", async () => {
    const caller = notificationRouter.createCaller(adminCtx);
    const res = await caller.saveChannelConfig({
      email: { smtpHost: "smtp.example.com", smtpFrom: "a@b.c" },
      telegram: { telegramBotToken: "tok" },
      push: { forgeApiUrl: "https://forge", forgeApiKey: "fk" },
      general: { publicBaseUrl: "https://home" },
    });
    expect(res.ok).toBe(true);
    // Channel creds (SMTP, Telegram token) → notification config store.
    expect(saveNotificationConfig).toHaveBeenCalledWith({
      smtpHost: "smtp.example.com",
      smtpFrom: "a@b.c",
      telegramBotToken: "tok",
    });
    // Forge (push) + general (base URL) → integrations config store.
    expect(saveIntegrationsConfig).toHaveBeenCalledWith({
      forgeApiUrl: "https://forge",
      forgeApiKey: "fk",
      publicBaseUrl: "https://home",
    });
    // Telegram section changed → bot reset + webhook re-registered live.
    expect(resetBot).toHaveBeenCalledOnce();
    expect(syncTelegramWebhook).toHaveBeenCalledWith("https://home");
  });

  it("saveChannelConfig is forbidden for a non-admin", async () => {
    const caller = notificationRouter.createCaller(userCtx);
    await expect(
      caller.saveChannelConfig({ telegram: { telegramBotToken: "x" } })
    ).rejects.toThrow();
    expect(saveNotificationConfig).not.toHaveBeenCalled();
  });

  it("generateVapidKeys persists a fresh keypair and returns the public key", async () => {
    const caller = notificationRouter.createCaller(adminCtx);
    const res = await caller.generateVapidKeys();
    expect(res).toEqual({ publicKey: "GEN_PUB" });
    expect(saveNotificationConfig).toHaveBeenCalledWith({
      vapidPublicKey: "GEN_PUB",
      vapidPrivateKey: "GEN_PRIV",
    });
  });
});
