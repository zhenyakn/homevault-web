import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory app_settings store so we can exercise env-first → DB resolution and
// the encrypt-at-rest round-trip without a real database.
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
  getIntegrationsConfig,
  getForgeConfig,
  getPublicBaseUrl,
  getTelegramWebhookSecret,
  getIntegrationsConfigStatus,
  loadIntegrationsConfig,
  saveIntegrationsConfig,
  INTEGRATION_SETTING_KEYS,
  _resetIntegrationsConfigForTests,
} from "./integrationsConfig";
import { isEncryptedEnvelope } from "./secrets";

const ENV_VARS = [
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
  "PUBLIC_BASE_URL",
  "TELEGRAM_WEBHOOK_SECRET",
];
function clearEnv() {
  for (const v of ENV_VARS) delete process.env[v];
}

beforeEach(() => {
  store.clear();
  clearEnv();
  _resetIntegrationsConfigForTests();
  process.env.JWT_SECRET = "test-secret-test-secret-1234567890";
});
afterEach(() => {
  clearEnv();
  _resetIntegrationsConfigForTests();
});

describe("resolution (env-first → DB)", () => {
  it("returns empty when nothing is set", () => {
    const c = getIntegrationsConfig();
    expect(c.forgeApiUrl).toBe("");
    expect(c.forgeApiKey).toBe("");
    expect(getPublicBaseUrl()).toBe("");
    expect(getTelegramWebhookSecret()).toBe("");
  });

  it("reads from the environment", () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.env";
    process.env.BUILT_IN_FORGE_API_KEY = "env-key";
    const forge = getForgeConfig();
    expect(forge.apiUrl).toBe("https://forge.env");
    expect(forge.apiKey).toBe("env-key");
  });

  it("falls back to the DB override when env is unset", async () => {
    await saveIntegrationsConfig({ forgeApiUrl: "https://forge.db" });
    expect(getForgeConfig().apiUrl).toBe("https://forge.db");
  });

  it("lets env win over a DB override", async () => {
    await saveIntegrationsConfig({ forgeApiUrl: "https://forge.db" });
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.env";
    expect(getForgeConfig().apiUrl).toBe("https://forge.env");
  });

  it("strips a trailing slash from the public base URL", async () => {
    await saveIntegrationsConfig({
      publicBaseUrl: "https://home.example.com/",
    });
    expect(getPublicBaseUrl()).toBe("https://home.example.com");
  });
});

describe("secrets", () => {
  it("encrypts the Forge API key and webhook secret at rest", async () => {
    await saveIntegrationsConfig({
      forgeApiKey: "forge-secret",
      telegramWebhookSecret: "hook-secret",
    });
    const k1 = store.get(INTEGRATION_SETTING_KEYS.forgeApiKey)!;
    const k2 = store.get(INTEGRATION_SETTING_KEYS.telegramWebhookSecret)!;
    expect(k1).not.toContain("forge-secret");
    expect(k2).not.toContain("hook-secret");
    expect(isEncryptedEnvelope(k1)).toBe(true);
    expect(isEncryptedEnvelope(k2)).toBe(true);
    expect(getForgeConfig().apiKey).toBe("forge-secret");
    expect(getTelegramWebhookSecret()).toBe("hook-secret");
  });

  it("keeps an existing secret when a blank value is supplied", async () => {
    await saveIntegrationsConfig({ forgeApiKey: "original" });
    await saveIntegrationsConfig({ forgeApiUrl: "https://x", forgeApiKey: "" });
    expect(getForgeConfig().apiKey).toBe("original");
  });

  it("stores the URL as plaintext and clears it when blanked", async () => {
    await saveIntegrationsConfig({ forgeApiUrl: "https://x" });
    expect(store.get(INTEGRATION_SETTING_KEYS.forgeApiUrl)).toBe("https://x");
    await saveIntegrationsConfig({ forgeApiUrl: "" });
    expect(store.has(INTEGRATION_SETTING_KEYS.forgeApiUrl)).toBe(false);
  });
});

describe("loadIntegrationsConfig", () => {
  it("rehydrates the overlay (decrypting secrets) from the DB", async () => {
    await saveIntegrationsConfig({
      forgeApiUrl: "https://forge.db",
      forgeApiKey: "s3cr3t",
    });
    _resetIntegrationsConfigForTests();
    expect(getForgeConfig().apiUrl).toBe("");

    await loadIntegrationsConfig();
    expect(getForgeConfig()).toEqual({
      apiUrl: "https://forge.db",
      apiKey: "s3cr3t",
    });
  });

  it("leaves the overlay intact when the DB read throws", async () => {
    const { getSetting } = await import("../db/appSettings");
    await saveIntegrationsConfig({ forgeApiUrl: "https://forge.db" });
    vi.mocked(getSetting).mockRejectedValueOnce(new Error("db down"));
    await loadIntegrationsConfig();
    expect(getForgeConfig().apiUrl).toBe("https://forge.db");
  });
});

describe("getIntegrationsConfigStatus — masked view", () => {
  it("never leaks secrets, only whether they exist", async () => {
    await saveIntegrationsConfig({
      forgeApiUrl: "https://forge.db",
      forgeApiKey: "forgesecretvalue",
      publicBaseUrl: "https://home.example.com",
      telegramWebhookSecret: "hooksecretvalue",
    });
    const s = getIntegrationsConfigStatus();
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain("forgesecretvalue");
    expect(serialized).not.toContain("hooksecretvalue");

    expect(s.push.configured).toBe(true);
    expect(s.push.apiUrl).toBe("https://forge.db");
    expect(s.push.apiKeySet).toBe(true);
    expect(s.general.publicBaseUrl).toBe("https://home.example.com");
    expect(s.general.webhookSecretSet).toBe(true);
  });

  it("flags env-sourced credentials as fromEnv", () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.env";
    process.env.PUBLIC_BASE_URL = "https://home.env";
    const s = getIntegrationsConfigStatus();
    expect(s.push.fromEnv).toBe(true);
    expect(s.general.publicBaseUrlFromEnv).toBe(true);
    expect(s.general.webhookSecretFromEnv).toBe(false);
  });
});
