import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory app_settings store so we can exercise the env-first → DB-override
// resolution and the encrypt-at-rest round-trip without a real database.
const store = new Map<string, string>();
vi.mock("../db/appSettings", () => ({
  getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteSetting: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  getNotificationConfig,
  getNotificationConfigStatus,
  isSectionConfigured,
  isFromEnv,
  loadNotificationConfig,
  saveNotificationConfig,
  NOTIFICATION_SETTING_KEYS,
  _resetNotificationConfigForTests,
} from "./config";
import { isEncryptedEnvelope } from "../_core/secrets";

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
];

function clearNotifEnv() {
  for (const v of NOTIF_ENV_VARS) delete process.env[v];
}

beforeEach(() => {
  store.clear();
  clearNotifEnv();
  _resetNotificationConfigForTests();
  // secrets.ts derives its KEK from JWT_SECRET.
  process.env.JWT_SECRET = "test-secret-test-secret-1234567890";
});

afterEach(() => {
  clearNotifEnv();
  _resetNotificationConfigForTests();
});

describe("getNotificationConfig — resolution", () => {
  it("returns defaults when nothing is set", () => {
    const c = getNotificationConfig();
    expect(c.smtpHost).toBe("");
    expect(c.telegramBotToken).toBe("");
    // Sensible defaults applied last.
    expect(c.vapidSubject).toBe("mailto:admin@homevault.local");
    expect(c.whatsappApiVersion).toBe("v21.0");
  });

  it("reads values from the environment", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "noreply@example.com";
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    const c = getNotificationConfig();
    expect(c.smtpHost).toBe("smtp.example.com");
    expect(c.smtpFrom).toBe("noreply@example.com");
    expect(c.telegramBotToken).toBe("env-token");
  });

  it("falls back to the DB overlay when env is unset", async () => {
    await saveNotificationConfig({ smtpHost: "db.example.com" });
    expect(getNotificationConfig().smtpHost).toBe("db.example.com");
  });

  it("lets env win over a DB override (env-first)", async () => {
    await saveNotificationConfig({ smtpHost: "db.example.com" });
    process.env.SMTP_HOST = "env.example.com";
    expect(getNotificationConfig().smtpHost).toBe("env.example.com");
  });

  it("overrides the vapidSubject / api version defaults from the DB", async () => {
    await saveNotificationConfig({
      vapidSubject: "mailto:me@x.com",
      whatsappApiVersion: "v19.0",
    });
    const c = getNotificationConfig();
    expect(c.vapidSubject).toBe("mailto:me@x.com");
    expect(c.whatsappApiVersion).toBe("v19.0");
  });
});

describe("isFromEnv", () => {
  it("is true only when the env var is non-empty", async () => {
    await saveNotificationConfig({ telegramBotToken: "db-token" });
    expect(isFromEnv("telegramBotToken")).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    expect(isFromEnv("telegramBotToken")).toBe(true);
  });
});

describe("isSectionConfigured", () => {
  it("email needs a host and a from-or-user", async () => {
    expect(isSectionConfigured("email")).toBe(false);
    await saveNotificationConfig({ smtpHost: "h" });
    expect(isSectionConfigured("email")).toBe(false);
    await saveNotificationConfig({ smtpFrom: "a@b.c" });
    expect(isSectionConfigured("email")).toBe(true);
  });

  it("telegram needs a token", async () => {
    expect(isSectionConfigured("telegram")).toBe(false);
    await saveNotificationConfig({ telegramBotToken: "t" });
    expect(isSectionConfigured("telegram")).toBe(true);
  });

  it("webpush needs both VAPID keys", async () => {
    await saveNotificationConfig({ vapidPublicKey: "pub" });
    expect(isSectionConfigured("webpush")).toBe(false);
    await saveNotificationConfig({ vapidPrivateKey: "priv" });
    expect(isSectionConfigured("webpush")).toBe(true);
  });

  it("whatsapp needs a phone id and an access token", async () => {
    await saveNotificationConfig({ whatsappPhoneNumberId: "123" });
    expect(isSectionConfigured("whatsapp")).toBe(false);
    await saveNotificationConfig({ whatsappAccessToken: "tok" });
    expect(isSectionConfigured("whatsapp")).toBe(true);
  });
});

describe("saveNotificationConfig — secrets", () => {
  it("encrypts secret fields at rest", async () => {
    await saveNotificationConfig({ smtpPass: "hunter2" });
    const stored = store.get(NOTIFICATION_SETTING_KEYS.smtpPass)!;
    expect(stored).toBeDefined();
    expect(stored).not.toContain("hunter2");
    expect(isEncryptedEnvelope(stored)).toBe(true);
    // Resolves back to plaintext via the overlay.
    expect(getNotificationConfig().smtpPass).toBe("hunter2");
  });

  it("stores non-secret fields as plaintext", async () => {
    await saveNotificationConfig({ smtpHost: "smtp.example.com" });
    expect(store.get(NOTIFICATION_SETTING_KEYS.smtpHost)).toBe(
      "smtp.example.com"
    );
  });

  it("keeps an existing secret when a blank value is supplied", async () => {
    await saveNotificationConfig({ smtpPass: "original" });
    await saveNotificationConfig({ smtpHost: "h", smtpPass: "" });
    expect(getNotificationConfig().smtpPass).toBe("original");
  });

  it("clears a non-secret field when blanked", async () => {
    await saveNotificationConfig({ smtpHost: "h" });
    await saveNotificationConfig({ smtpHost: "" });
    expect(getNotificationConfig().smtpHost).toBe("");
    expect(store.has(NOTIFICATION_SETTING_KEYS.smtpHost)).toBe(false);
  });

  it("ignores unknown fields", async () => {
    await saveNotificationConfig({ bogus: "x" } as never);
    expect(store.size).toBe(0);
  });
});

describe("loadNotificationConfig", () => {
  it("rehydrates the overlay (decrypting secrets) from the DB", async () => {
    await saveNotificationConfig({
      smtpHost: "smtp.example.com",
      smtpPass: "s3cr3t",
    });
    // Simulate a fresh process: drop the in-memory overlay, keep the store.
    _resetNotificationConfigForTests();
    expect(getNotificationConfig().smtpHost).toBe("");

    await loadNotificationConfig();
    const c = getNotificationConfig();
    expect(c.smtpHost).toBe("smtp.example.com");
    expect(c.smtpPass).toBe("s3cr3t");
  });

  it("leaves the overlay intact when the DB read throws", async () => {
    const { getSetting } = await import("../db/appSettings");
    await saveNotificationConfig({ smtpHost: "smtp.example.com" });
    vi.mocked(getSetting).mockRejectedValueOnce(new Error("db down"));
    await loadNotificationConfig(); // must not throw
    expect(getNotificationConfig().smtpHost).toBe("smtp.example.com");
  });
});

describe("credentialUnreadable — at-rest key changed", () => {
  it("flags a section whose secret can't be decrypted after the key changes", async () => {
    // Saved under the original key…
    await saveNotificationConfig({
      smtpHost: "smtp.example.com",
      smtpFrom: "a@b.c",
      smtpPass: "hunter2",
      telegramBotToken: "bot-token",
    });
    // …then the at-rest key (derived from JWT_SECRET) changes, as happens on a
    // rotation or when an ephemeral secret is regenerated at boot.
    process.env.JWT_SECRET = "a-totally-different-secret-0987654321";
    _resetNotificationConfigForTests();
    await loadNotificationConfig();

    const s = getNotificationConfigStatus();
    expect(s.email.credentialUnreadable).toBe(true);
    expect(s.telegram.credentialUnreadable).toBe(true);
    // Undecryptable secrets are dropped, so the secret no longer resolves.
    expect(getNotificationConfig().smtpPass).toBe("");
    // Sections without a stored secret are not flagged.
    expect(s.webpush.credentialUnreadable).toBe(false);
    expect(s.whatsapp.credentialUnreadable).toBe(false);
  });

  it("clears the flag once the secret is re-entered", async () => {
    await saveNotificationConfig({ telegramBotToken: "old-token" });
    process.env.JWT_SECRET = "a-totally-different-secret-0987654321";
    _resetNotificationConfigForTests();
    await loadNotificationConfig();
    expect(getNotificationConfigStatus().telegram.credentialUnreadable).toBe(
      true
    );

    await saveNotificationConfig({ telegramBotToken: "new-token" });
    expect(getNotificationConfigStatus().telegram.credentialUnreadable).toBe(
      false
    );
    expect(getNotificationConfig().telegramBotToken).toBe("new-token");
  });

  it("does not flag when env supplies the credential", async () => {
    await saveNotificationConfig({ telegramBotToken: "old-token" });
    process.env.JWT_SECRET = "a-totally-different-secret-0987654321";
    _resetNotificationConfigForTests();
    await loadNotificationConfig();
    // Env wins and doesn't depend on the at-rest key, so no re-entry prompt.
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    expect(getNotificationConfigStatus().telegram.credentialUnreadable).toBe(
      false
    );
  });
});

describe("getNotificationConfigStatus — masked view", () => {
  it("never leaks secrets, only whether they exist", async () => {
    await saveNotificationConfig({
      smtpHost: "smtp.example.com",
      smtpFrom: "a@b.c",
      smtpPass: "topsecret",
      telegramBotToken: "secretbottoken",
      vapidPublicKey: "pub",
      vapidPrivateKey: "secretvapidkey",
      whatsappPhoneNumberId: "123",
      whatsappAccessToken: "secretwatoken",
    });
    const s = getNotificationConfigStatus();

    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain("topsecret");
    expect(serialized).not.toContain("secretbottoken");
    expect(serialized).not.toContain("secretvapidkey");
    expect(serialized).not.toContain("secretwatoken");

    expect(s.email.configured).toBe(true);
    expect(s.email.host).toBe("smtp.example.com");
    expect(s.email.passSet).toBe(true);
    expect(s.telegram.configured).toBe(true);
    expect(s.telegram.tokenSet).toBe(true);
    expect(s.webpush.configured).toBe(true);
    expect(s.webpush.publicKey).toBe("pub");
    expect(s.webpush.privateKeySet).toBe(true);
    expect(s.whatsapp.configured).toBe(true);
    expect(s.whatsapp.phoneNumberId).toBe("123");
    expect(s.whatsapp.tokenSet).toBe(true);
  });

  it("flags env-sourced credentials as fromEnv", () => {
    process.env.SMTP_HOST = "smtp.env.com";
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    const s = getNotificationConfigStatus();
    expect(s.email.fromEnv).toBe(true);
    expect(s.telegram.fromEnv).toBe(true);
    expect(s.webpush.fromEnv).toBe(false);
    expect(s.whatsapp.fromEnv).toBe(false);
  });
});
