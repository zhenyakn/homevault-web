import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory app_settings so we can exercise persistence + read-back of the last
// test result without a real database.
const store = new Map<string, string>();
vi.mock("../db/appSettings", () => ({
  getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

// Effective config + "is configured?" are stubbed per-test so the probes run
// against known inputs.
const config = {
  telegramBotToken: "",
  whatsappPhoneNumberId: "",
  whatsappAccessToken: "",
  whatsappApiVersion: "v21.0",
  vapidPublicKey: "",
  vapidPrivateKey: "",
  vapidSubject: "mailto:a@b.c",
};
const configured = new Set<string>();
vi.mock("./config", () => ({
  getNotificationConfig: () => config,
  isSectionConfigured: (s: string) => configured.has(s),
}));

const forge = { apiUrl: "", apiKey: "" };
vi.mock("../_core/integrationsConfig", () => ({
  getForgeConfig: () => forge,
}));

const verifyEmailConnection = vi.fn(async () => {});
const sendTestEmail = vi.fn(async (_to: string) => {});
vi.mock("./channels/email", () => ({
  verifyEmailConnection: () => verifyEmailConnection(),
  sendTestEmail: (to: string) => sendTestEmail(to),
}));

const notifyOwner = vi.fn(async () => true);
vi.mock("../_core/notification", () => ({
  notifyOwner: () => notifyOwner(),
}));

const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails: (...a: unknown[]) => setVapidDetails(...a) },
}));

import { runIntegrationTest, getIntegrationTestResults } from "./verify";

beforeEach(() => {
  store.clear();
  configured.clear();
  Object.assign(config, {
    telegramBotToken: "",
    whatsappPhoneNumberId: "",
    whatsappAccessToken: "",
    whatsappApiVersion: "v21.0",
    vapidPublicKey: "",
    vapidPrivateKey: "",
    vapidSubject: "mailto:a@b.c",
  });
  forge.apiUrl = "";
  forge.apiKey = "";
  verifyEmailConnection.mockClear().mockResolvedValue(undefined);
  sendTestEmail.mockClear().mockResolvedValue(undefined);
  notifyOwner.mockClear().mockResolvedValue(true);
  setVapidDetails.mockClear();
  vi.restoreAllMocks();
});

describe("runIntegrationTest — probes", () => {
  it("reports not-configured without calling out", async () => {
    const r = await runIntegrationTest("telegram", 1);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not configured/i);
  });

  it("telegram: ok when getMe succeeds", async () => {
    config.telegramBotToken = "123:abc";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { username: "hv_bot" } }))
    );
    const r = await runIntegrationTest("telegram", 7);
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("@hv_bot");
    expect(r.actorUserId).toBe(7);
  });

  it("telegram: fails with the API description on a bad token", async () => {
    config.telegramBotToken = "bad";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
        status: 401,
      })
    );
    const r = await runIntegrationTest("telegram", 1);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("Unauthorized");
  });

  it("email: ok when the SMTP handshake verifies, fails when it throws", async () => {
    configured.add("email");
    let r = await runIntegrationTest("email", 1);
    expect(r.ok).toBe(true);

    verifyEmailConnection.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    r = await runIntegrationTest("email", 1);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("ECONNREFUSED");
  });

  it("email: sends a real test message when a recipient is supplied", async () => {
    configured.add("email");
    const r = await runIntegrationTest("email", 1, { testEmailTo: "me@x.com" });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("me@x.com");
    expect(verifyEmailConnection).toHaveBeenCalledOnce();
    expect(sendTestEmail).toHaveBeenCalledWith("me@x.com");
  });

  it("email: a failed send is reported, not thrown", async () => {
    configured.add("email");
    sendTestEmail.mockRejectedValueOnce(new Error("550 relay denied"));
    const r = await runIntegrationTest("email", 1, { testEmailTo: "me@x.com" });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("550 relay denied");
  });

  it("email: handshake-only when no recipient is supplied", async () => {
    configured.add("email");
    const r = await runIntegrationTest("email", 1);
    expect(r.ok).toBe(true);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it("push: maps the notifyOwner boolean to ok/failed", async () => {
    forge.apiUrl = "https://forge";
    forge.apiKey = "k";
    let r = await runIntegrationTest("push", 1);
    expect(r.ok).toBe(true);

    notifyOwner.mockResolvedValueOnce(false);
    r = await runIntegrationTest("push", 1);
    expect(r.ok).toBe(false);
  });

  it("webpush: ok when the VAPID pair validates", async () => {
    configured.add("webpush");
    config.vapidPublicKey = "pub";
    config.vapidPrivateKey = "priv";
    const r = await runIntegrationTest("webpush", 1);
    expect(r.ok).toBe(true);
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:a@b.c", "pub", "priv");
  });
});

describe("persistence", () => {
  it("stores the last result and reads it back per section", async () => {
    config.telegramBotToken = "123:abc";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { username: "b" } }))
    );
    await runIntegrationTest("telegram", 42);

    const results = await getIntegrationTestResults();
    expect(results.telegram?.ok).toBe(true);
    expect(results.telegram?.actorUserId).toBe(42);
    expect(typeof results.telegram?.at).toBe("string");
    // Untested sections come back null.
    expect(results.email).toBeNull();
  });
});
