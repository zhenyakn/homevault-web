/**
 * Runtime notification configuration.
 *
 * Notification channels (email/SMTP, Telegram, browser Web Push/VAPID, WhatsApp)
 * need server-side credentials. Historically those came ONLY from env vars, so a
 * self-hosted install that hadn't edited its environment saw every channel
 * except in-app skipped as "not configured" — with no way to fix it from the UI.
 *
 * This module mirrors the storage (S3) pattern: each field resolves env-first,
 * then an admin-set override persisted in the generic `app_settings` table
 * (secrets encrypted at rest with the same AES-256-GCM envelope as the S3 secret
 * and the Drive refresh token). Env always wins, so an env-only install is
 * unaffected and a hostile DB row can never shadow an explicit env credential.
 *
 * Resolution is SYNCHRONOUS because the channel adapters' `isConfigured()` is
 * sync and called inside the dispatcher's hot path. The DB overrides are loaded
 * once into an in-memory overlay at boot (`loadNotificationConfig`) and refreshed
 * whenever an admin saves (`saveNotificationConfig`). Env values are read live
 * from `process.env` so the resolver honours runtime env changes and is trivial
 * to unit-test.
 */

import { encryptSecret, readMaybeEncrypted } from "../_core/secrets";
import { getSetting, setSetting, deleteSetting } from "../db/appSettings";

/** Logical groups the Settings UI configures one form at a time. */
export type NotificationSection = "email" | "telegram" | "webpush" | "whatsapp";

/** `app_settings` keys backing each configurable field. */
export const NOTIFICATION_SETTING_KEYS = {
  smtpHost: "notifications.smtp.host",
  smtpPort: "notifications.smtp.port",
  smtpUser: "notifications.smtp.user",
  smtpPass: "notifications.smtp.pass",
  smtpFrom: "notifications.smtp.from",
  telegramBotToken: "notifications.telegram.botToken",
  vapidPublicKey: "notifications.webpush.publicKey",
  vapidPrivateKey: "notifications.webpush.privateKey",
  vapidSubject: "notifications.webpush.subject",
  whatsappPhoneNumberId: "notifications.whatsapp.phoneNumberId",
  whatsappAccessToken: "notifications.whatsapp.accessToken",
  whatsappApiVersion: "notifications.whatsapp.apiVersion",
} as const;

export type NotificationField = keyof typeof NOTIFICATION_SETTING_KEYS;

const FIELDS = Object.keys(NOTIFICATION_SETTING_KEYS) as NotificationField[];

/** Fields whose values are sensitive — encrypted at rest, masked in status. */
const SECRET_FIELDS: ReadonlySet<NotificationField> =
  new Set<NotificationField>([
    "smtpPass",
    "telegramBotToken",
    "vapidPrivateKey",
    "whatsappAccessToken",
  ]);

/** Env var each field reads from (env-first resolution). */
const ENV_VAR: Record<NotificationField, string> = {
  smtpHost: "SMTP_HOST",
  smtpPort: "SMTP_PORT",
  smtpUser: "SMTP_USER",
  smtpPass: "SMTP_PASS",
  smtpFrom: "SMTP_FROM",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  vapidPublicKey: "VAPID_PUBLIC_KEY",
  vapidPrivateKey: "VAPID_PRIVATE_KEY",
  vapidSubject: "VAPID_SUBJECT",
  whatsappPhoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  whatsappAccessToken: "WHATSAPP_ACCESS_TOKEN",
  whatsappApiVersion: "WHATSAPP_API_VERSION",
};

const DEFAULT_VAPID_SUBJECT = "mailto:admin@homevault.local";
const DEFAULT_WHATSAPP_API_VERSION = "v21.0";

export type EffectiveNotificationConfig = Record<NotificationField, string>;

// Decrypted DB overrides, populated by loadNotificationConfig() and kept fresh
// by saveNotificationConfig(). Absent until a value is stored.
const overlay: Partial<Record<NotificationField, string>> = {};

// Secret fields whose stored ciphertext was present but could NOT be decrypted
// on load — almost always because JWT_SECRET (which derives the at-rest key)
// changed since the value was saved. Tracked so the admin UI can prompt a
// re-entry instead of silently showing the channel as unconfigured.
const unreadable = new Set<NotificationField>();

/** The single secret field backing each section's "needs re-entry" check. */
const SECTION_SECRET_FIELDS: Record<NotificationSection, NotificationField[]> =
  {
    email: ["smtpPass"],
    telegram: ["telegramBotToken"],
    webpush: ["vapidPrivateKey"],
    whatsapp: ["whatsappAccessToken"],
  };

/** True when a section's secret is stored but can't be decrypted (key changed). */
export function isSectionCredentialUnreadable(
  section: NotificationSection
): boolean {
  return SECTION_SECRET_FIELDS[section].some(f => unreadable.has(f));
}

/** Raw env value for a field (empty string when unset). */
function envValue(field: NotificationField): string {
  return process.env[ENV_VAR[field]] ?? "";
}

/** True when this field is supplied by the environment (env wins over DB). */
export function isFromEnv(field: NotificationField): boolean {
  return envValue(field).trim().length > 0;
}

/**
 * Effective config: per field, the env value if set, else the DB override, with
 * sensible defaults applied last. Synchronous and allocation-cheap.
 */
export function getNotificationConfig(): EffectiveNotificationConfig {
  const out = {} as EffectiveNotificationConfig;
  for (const field of FIELDS) {
    const env = envValue(field);
    out[field] = env || overlay[field] || "";
  }
  if (!out.vapidSubject) out.vapidSubject = DEFAULT_VAPID_SUBJECT;
  if (!out.whatsappApiVersion)
    out.whatsappApiVersion = DEFAULT_WHATSAPP_API_VERSION;
  return out;
}

/** Whether a channel has the credentials it needs (env or DB) to deliver. */
export function isSectionConfigured(section: NotificationSection): boolean {
  const c = getNotificationConfig();
  switch (section) {
    case "email":
      return Boolean(c.smtpHost && (c.smtpFrom || c.smtpUser));
    case "telegram":
      return Boolean(c.telegramBotToken);
    case "webpush":
      return Boolean(c.vapidPublicKey && c.vapidPrivateKey);
    case "whatsapp":
      return Boolean(c.whatsappPhoneNumberId && c.whatsappAccessToken);
  }
}

/**
 * Load every DB override into the in-memory overlay (decrypting secrets). Safe
 * to call repeatedly; a DB read failure leaves the existing overlay untouched so
 * an env-only install keeps working even when the settings table is unreachable.
 */
export async function loadNotificationConfig(): Promise<void> {
  await Promise.all(
    FIELDS.map(async field => {
      let raw: string | null;
      try {
        raw = await getSetting(NOTIFICATION_SETTING_KEYS[field]);
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
          // Drop it so the channel degrades gracefully, but flag it so the UI
          // can ask the admin to re-enter the credential.
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

export type NotificationConfigInput = Partial<
  Record<NotificationField, string>
>;

/**
 * Persist an admin's config edits and refresh the overlay.
 *
 * Secrets: a blank value means "keep the existing secret" (so an admin editing
 * the SMTP host needn't re-enter the password); a non-blank value is encrypted
 * and stored. Non-secret fields: a blank value clears the override (falling back
 * to env / default). Only the fields present in `values` are touched.
 */
export async function saveNotificationConfig(
  values: NotificationConfigInput
): Promise<void> {
  for (const field of Object.keys(values) as NotificationField[]) {
    if (!(field in NOTIFICATION_SETTING_KEYS)) continue;
    const key = NOTIFICATION_SETTING_KEYS[field];
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

export type SectionStatus = {
  configured: boolean;
  /** Credentials come from env vars (read-only from the UI's perspective). */
  fromEnv: boolean;
  /**
   * A secret was stored for this section but could not be decrypted on load
   * (the at-rest key changed). The admin must re-enter it. Always false when
   * `fromEnv`, since env values don't depend on the at-rest key.
   */
  credentialUnreadable: boolean;
};

export type EmailStatus = SectionStatus & {
  host: string | null;
  port: string | null;
  user: string | null;
  from: string | null;
  passSet: boolean;
};
export type TelegramStatus = SectionStatus & { tokenSet: boolean };
export type WebPushStatus = SectionStatus & {
  publicKey: string | null;
  subject: string | null;
  privateKeySet: boolean;
};
export type WhatsAppStatus = SectionStatus & {
  phoneNumberId: string | null;
  apiVersion: string | null;
  tokenSet: boolean;
};

export type NotificationConfigStatus = {
  email: EmailStatus;
  telegram: TelegramStatus;
  webpush: WebPushStatus;
  whatsapp: WhatsAppStatus;
};

/**
 * Masked, UI-safe view of the effective config. Never returns secret values,
 * only whether each secret exists. Non-secret values (host, public key, …) are
 * returned so the admin form can show what's currently in effect.
 */
export function getNotificationConfigStatus(): NotificationConfigStatus {
  const c = getNotificationConfig();
  return {
    email: {
      configured: isSectionConfigured("email"),
      fromEnv: isFromEnv("smtpHost"),
      credentialUnreadable:
        !isFromEnv("smtpHost") && isSectionCredentialUnreadable("email"),
      host: c.smtpHost || null,
      port: c.smtpPort || null,
      user: c.smtpUser || null,
      from: c.smtpFrom || null,
      passSet: Boolean(c.smtpPass),
    },
    telegram: {
      configured: isSectionConfigured("telegram"),
      fromEnv: isFromEnv("telegramBotToken"),
      credentialUnreadable:
        !isFromEnv("telegramBotToken") &&
        isSectionCredentialUnreadable("telegram"),
      tokenSet: Boolean(c.telegramBotToken),
    },
    webpush: {
      configured: isSectionConfigured("webpush"),
      fromEnv: isFromEnv("vapidPublicKey"),
      credentialUnreadable:
        !isFromEnv("vapidPublicKey") &&
        isSectionCredentialUnreadable("webpush"),
      publicKey: c.vapidPublicKey || null,
      subject: c.vapidSubject || null,
      privateKeySet: Boolean(c.vapidPrivateKey),
    },
    whatsapp: {
      configured: isSectionConfigured("whatsapp"),
      fromEnv: isFromEnv("whatsappPhoneNumberId"),
      credentialUnreadable:
        !isFromEnv("whatsappPhoneNumberId") &&
        isSectionCredentialUnreadable("whatsapp"),
      phoneNumberId: c.whatsappPhoneNumberId || null,
      apiVersion: c.whatsappApiVersion || null,
      tokenSet: Boolean(c.whatsappAccessToken),
    },
  };
}

/** Test hook — clears the overlay so each test starts from env-only. */
export function _resetNotificationConfigForTests(): void {
  for (const field of FIELDS) delete overlay[field];
  unreadable.clear();
}
