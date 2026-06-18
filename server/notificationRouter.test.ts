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

const adminCtx = {
  user: { id: 1, globalRole: "superadmin" },
  tenantId: null,
} as any;
const userCtx = {
  user: { id: 2, globalRole: "user" },
  tenantId: null,
} as any;

beforeEach(() => vi.clearAllMocks());

describe("notificationRouter admin config endpoints", () => {
  it("getChannelConfig returns the masked status for an admin", async () => {
    const caller = notificationRouter.createCaller(adminCtx);
    const status = await caller.getChannelConfig();
    expect(getNotificationConfigStatus).toHaveBeenCalledOnce();
    expect(status.email.configured).toBe(false);
  });

  it("getChannelConfig is forbidden for a non-admin", async () => {
    const caller = notificationRouter.createCaller(userCtx);
    await expect(caller.getChannelConfig()).rejects.toThrow();
    expect(getNotificationConfigStatus).not.toHaveBeenCalled();
  });

  it("saveChannelConfig flattens the per-section input", async () => {
    const caller = notificationRouter.createCaller(adminCtx);
    const res = await caller.saveChannelConfig({
      email: { smtpHost: "smtp.example.com", smtpFrom: "a@b.c" },
      telegram: { telegramBotToken: "tok" },
    });
    expect(res).toEqual({ ok: true });
    expect(saveNotificationConfig).toHaveBeenCalledWith({
      smtpHost: "smtp.example.com",
      smtpFrom: "a@b.c",
      telegramBotToken: "tok",
    });
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
