/**
 * Runtime integration configuration — the cross-cutting credentials that aren't
 * tied to a single notification channel but still gate delivery/features:
 *
 *   - Forge API (URL + key): powers the built-in "push" notification channel as
 *     well as LLM, voice transcription, the Maps proxy and the data API.
 *   - PUBLIC_BASE_URL: absolute origin used to build links in emails (auth
 *     verification / reset / invite + notification deep-links) and to register
 *     the Telegram webhook.
 *   - Telegram webhook secret: verifies inbound Telegram webhook calls.
 *
 * Same contract as `server/notifications/config.ts`: each field resolves
 * env-first, then an admin-set override persisted in `app_settings` (secrets
 * encrypted at rest). Env always wins. Lives in `_core` so core features can
 * depend on it without reaching into a feature module.
 */

import { encryptSecret, readMaybeEncrypted } from "./secrets";
import { getSetting, setSetting, deleteSetting } from "../db/appSettings";

/** `app_settings` keys backing each configurable field. */
export const INTEGRATION_SETTING_KEYS = {
  forgeApiUrl: "integrations.forge.apiUrl",
  forgeApiKey: "integrations.forge.apiKey",
  publicBaseUrl: "site.publicBaseUrl",
  telegramWebhookSecret: "integrations.telegram.webhookSecret",
} as const;

export type IntegrationField = keyof typeof INTEGRATION_SETTING_KEYS;

const FIELDS = Object.keys(INTEGRATION_SETTING_KEYS) as IntegrationField[];

const SECRET_FIELDS: ReadonlySet<IntegrationField> = new Set<IntegrationField>([
  "forgeApiKey",
  "telegramWebhookSecret",
]);

const ENV_VAR: Record<IntegrationField, string> = {
  forgeApiUrl: "BUILT_IN_FORGE_API_URL",
  forgeApiKey: "BUILT_IN_FORGE_API_KEY",
  publicBaseUrl: "PUBLIC_BASE_URL",
  telegramWebhookSecret: "TELEGRAM_WEBHOOK_SECRET",
};

export type EffectiveIntegrationsConfig = Record<IntegrationField, string>;

const overlay: Partial<Record<IntegrationField, string>> = {};

// Secret fields whose stored ciphertext was present but could NOT be decrypted
// on load (the at-rest key, derived from JWT_SECRET, changed since the value was
// saved). Surfaced to the admin UI so it can prompt a re-entry.
const unreadable = new Set<IntegrationField>();

function envValue(field: IntegrationField): string {
  return process.env[ENV_VAR[field]] ?? "";
}

/** True when this field is supplied by the environment (env wins over DB). */
export function isFromEnv(field: IntegrationField): boolean {
  return envValue(field).trim().length > 0;
}

/** Effective config: per field, the env value if set, else the DB override. */
export function getIntegrationsConfig(): EffectiveIntegrationsConfig {
  const out = {} as EffectiveIntegrationsConfig;
  for (const field of FIELDS) {
    out[field] = envValue(field) || overlay[field] || "";
  }
  return out;
}

/** Forge API credentials for the push channel + AI/maps/data features. */
export function getForgeConfig(): { apiUrl: string; apiKey: string } {
  const c = getIntegrationsConfig();
  return { apiUrl: c.forgeApiUrl, apiKey: c.forgeApiKey };
}

/** Absolute public origin (no trailing slash) used to build links. */
export function getPublicBaseUrl(): string {
  return getIntegrationsConfig().publicBaseUrl.replace(/\/+$/, "");
}

/** Secret token verifying inbound Telegram webhook calls (empty when unset). */
export function getTelegramWebhookSecret(): string {
  return getIntegrationsConfig().telegramWebhookSecret;
}

/**
 * Load every DB override into the in-memory overlay (decrypting secrets). Safe
 * to call repeatedly; a DB read failure leaves the existing overlay untouched.
 */
export async function loadIntegrationsConfig(): Promise<void> {
  await Promise.all(
    FIELDS.map(async field => {
      let raw: string | null;
      try {
        raw = await getSetting(INTEGRATION_SETTING_KEYS[field]);
      } catch {
        // DB unreachable — keep whatever we already have for this field.
        return;
      }
      if (raw == null) {
        delete overlay[field];
        unreadable.delete(field);
        return;
      }
      if (SECRET_FIELDS.has(field)) {
        try {
          overlay[field] = readMaybeEncrypted(raw) ?? "";
          unreadable.delete(field);
        } catch {
          // Ciphertext present but undecryptable (JWT_SECRET changed/rotated).
          delete overlay[field];
          unreadable.add(field);
        }
      } else {
        overlay[field] = raw;
        unreadable.delete(field);
      }
    })
  );
}

export type IntegrationsConfigInput = Partial<Record<IntegrationField, string>>;

/**
 * Persist admin edits and refresh the overlay. Secrets left blank are kept;
 * non-secret fields left blank are cleared (fall back to env). Only the fields
 * present in `values` are touched.
 */
export async function saveIntegrationsConfig(
  values: IntegrationsConfigInput
): Promise<void> {
  for (const field of Object.keys(values) as IntegrationField[]) {
    if (!(field in INTEGRATION_SETTING_KEYS)) continue;
    const key = INTEGRATION_SETTING_KEYS[field];
    const trimmed = (values[field] ?? "").trim();

    if (SECRET_FIELDS.has(field)) {
      if (trimmed === "") continue; // keep existing secret
      await setSetting(key, encryptSecret(trimmed));
      overlay[field] = trimmed;
      unreadable.delete(field); // freshly re-encrypted → readable again
      continue;
    }

    if (trimmed === "") {
      await deleteSetting(key);
      delete overlay[field];
    } else {
      await setSetting(key, trimmed);
      overlay[field] = trimmed;
    }
  }
}

export type PushStatus = {
  configured: boolean;
  fromEnv: boolean;
  /** API key stored but undecryptable (at-rest key changed) — re-entry needed. */
  apiKeyUnreadable: boolean;
  apiUrl: string | null;
  apiKeySet: boolean;
};
export type GeneralStatus = {
  publicBaseUrl: string | null;
  publicBaseUrlFromEnv: boolean;
  webhookSecretSet: boolean;
  webhookSecretFromEnv: boolean;
  /** Webhook secret stored but undecryptable — re-entry needed. */
  webhookSecretUnreadable: boolean;
};

export type IntegrationsConfigStatus = {
  push: PushStatus;
  general: GeneralStatus;
};

/** Masked, UI-safe view: non-secret values + whether each secret exists. */
export function getIntegrationsConfigStatus(): IntegrationsConfigStatus {
  const c = getIntegrationsConfig();
  return {
    push: {
      configured: Boolean(c.forgeApiUrl && c.forgeApiKey),
      fromEnv: isFromEnv("forgeApiUrl"),
      apiKeyUnreadable: !isFromEnv("forgeApiKey") && unreadable.has("forgeApiKey"),
      apiUrl: c.forgeApiUrl || null,
      apiKeySet: Boolean(c.forgeApiKey),
    },
    general: {
      publicBaseUrl: c.publicBaseUrl || null,
      publicBaseUrlFromEnv: isFromEnv("publicBaseUrl"),
      webhookSecretSet: Boolean(c.telegramWebhookSecret),
      webhookSecretFromEnv: isFromEnv("telegramWebhookSecret"),
      webhookSecretUnreadable:
        !isFromEnv("telegramWebhookSecret") &&
        unreadable.has("telegramWebhookSecret"),
    },
  };
}

/** Test hook — clears the overlay so each test starts from env-only. */
export function _resetIntegrationsConfigForTests(): void {
  for (const field of FIELDS) delete overlay[field];
  unreadable.clear();
}
