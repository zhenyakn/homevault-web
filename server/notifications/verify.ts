/**
 * Integration connection tests.
 *
 * The channel `isConfigured()` checks only answer "are credentials present?" —
 * they can't tell an admin whether those credentials actually work. This module
 * actively *probes* each server-side integration (real SMTP handshake, Telegram
 * `getMe`, the WhatsApp Graph node, VAPID key validation, a Forge push) so the
 * Settings UI can show a meaningful Ready / Failed state and the admin can
 * confirm a channel end-to-end.
 *
 * Each probe returns `{ ok, detail }`. The outcome of the most recent test per
 * section is persisted to `app_settings` so the indicator survives reloads, and
 * the caller (notificationRouter) writes an audit-log entry — giving an
 * enterprise-grade record of who tested what, when, and the result.
 */

import webpush from "web-push";
import { getSetting, setSetting } from "../db/appSettings";
import { getNotificationConfig, isSectionConfigured } from "./config";
import { getForgeConfig } from "../_core/integrationsConfig";
import { verifyEmailConnection } from "./channels/email";
import { notifyOwner } from "../_core/notification";

/** Server-side integrations that expose a "Test connection" action. */
export const TESTABLE_SECTIONS = [
  "email",
  "telegram",
  "whatsapp",
  "webpush",
  "push",
] as const;

export type TestableSection = (typeof TESTABLE_SECTIONS)[number];

/** Outcome of a single probe. `detail` is a short, UI-safe message. */
export type IntegrationTestResult = { ok: boolean; detail: string };

/** A persisted test result, with who ran it and when. */
export type IntegrationTestRecord = IntegrationTestResult & {
  /** ISO-8601 timestamp of when the test ran. */
  at: string;
  actorUserId: number | null;
};

const settingKey = (s: TestableSection): string => `integrations.test.${s}`;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const ok = (detail = "Connection OK"): IntegrationTestResult => ({
  ok: true,
  detail,
});
const fail = (detail: string): IntegrationTestResult => ({
  ok: false,
  detail,
});

const NOT_CONFIGURED = "Not configured";

async function probeTelegram(): Promise<IntegrationTestResult> {
  const { telegramBotToken } = getNotificationConfig();
  if (!telegramBotToken) return fail(NOT_CONFIGURED);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${telegramBotToken}/getMe`
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { username?: string };
    };
    if (res.ok && json.ok) {
      const handle = json.result?.username;
      return ok(handle ? `Connected as @${handle}` : "Bot token valid");
    }
    return fail(json.description ?? `Telegram API returned HTTP ${res.status}`);
  } catch (e) {
    return fail(errMsg(e));
  }
}

async function probeWhatsApp(): Promise<IntegrationTestResult> {
  const { whatsappPhoneNumberId, whatsappAccessToken, whatsappApiVersion } =
    getNotificationConfig();
  if (!whatsappPhoneNumberId || !whatsappAccessToken)
    return fail(NOT_CONFIGURED);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { authorization: `Bearer ${whatsappAccessToken}` } }
    );
    const json = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    };
    if (res.ok) {
      const who = json.verified_name ?? json.display_phone_number;
      return ok(who ? `Connected as ${who}` : "Credentials valid");
    }
    return fail(json.error?.message ?? `Graph API returned HTTP ${res.status}`);
  } catch (e) {
    return fail(errMsg(e));
  }
}

async function probeEmail(): Promise<IntegrationTestResult> {
  if (!isSectionConfigured("email")) return fail(NOT_CONFIGURED);
  try {
    await verifyEmailConnection();
    return ok("SMTP connection verified");
  } catch (e) {
    return fail(errMsg(e));
  }
}

function probeWebPush(): IntegrationTestResult {
  if (!isSectionConfigured("webpush")) return fail(NOT_CONFIGURED);
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } =
    getNotificationConfig();
  try {
    // setVapidDetails validates the subject + key encoding; throws on a bad pair.
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    return ok("VAPID keys valid");
  } catch (e) {
    return fail(errMsg(e));
  }
}

async function probePush(): Promise<IntegrationTestResult> {
  const { apiUrl, apiKey } = getForgeConfig();
  if (!apiUrl || !apiKey) return fail(NOT_CONFIGURED);
  try {
    const accepted = await notifyOwner({
      title: "HomeVault integration test",
      content: "Connection test from Settings → Integrations.",
    });
    return accepted
      ? ok("Test push accepted by the service")
      : fail("Push service did not accept the request");
  } catch (e) {
    return fail(errMsg(e));
  }
}

async function probe(section: TestableSection): Promise<IntegrationTestResult> {
  switch (section) {
    case "email":
      return probeEmail();
    case "telegram":
      return probeTelegram();
    case "whatsapp":
      return probeWhatsApp();
    case "webpush":
      return probeWebPush();
    case "push":
      return probePush();
  }
}

/**
 * Run the connection test for one section, persist the outcome (best-effort), and
 * return the recorded result. Never throws — a probe failure is reported as
 * `{ ok: false }`, not an exception.
 */
export async function runIntegrationTest(
  section: TestableSection,
  actorUserId: number | null
): Promise<IntegrationTestRecord> {
  const result = await probe(section);
  const record: IntegrationTestRecord = {
    ...result,
    at: new Date().toISOString(),
    actorUserId,
  };
  try {
    await setSetting(settingKey(section), JSON.stringify(record));
  } catch {
    // Persisting the indicator must never break the test itself.
  }
  return record;
}

export type IntegrationTestResults = Record<
  TestableSection,
  IntegrationTestRecord | null
>;

/** The last persisted test result per section (null when never tested). */
export async function getIntegrationTestResults(): Promise<IntegrationTestResults> {
  const entries = await Promise.all(
    TESTABLE_SECTIONS.map(async section => {
      try {
        const raw = await getSetting(settingKey(section));
        const parsed = raw ? (JSON.parse(raw) as IntegrationTestRecord) : null;
        return [section, parsed] as const;
      } catch {
        return [section, null] as const;
      }
    })
  );
  return Object.fromEntries(entries) as IntegrationTestResults;
}
