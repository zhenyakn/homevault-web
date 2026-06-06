/**
 * Server-side notification i18n — PURE. Translates a language-independent
 * `ReminderMessage` (i18n key + params) into the resolved `NotificationPayload`
 * (literal title/body) that the channels and delivery log consume.
 *
 * Self-contained: the message catalog lives in ./locales/*.json so the server
 * doesn't reach into the client bundle, and the lookup/interpolation is
 * dependency-free and unit-tested (i18n.test.ts).
 */

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";
import type { NotificationPayload, ReminderMessage } from "./types";

type Catalog = Record<string, unknown>;

const CATALOGS: Record<string, Catalog> = { en, he, ru };

/** Languages we ship server-side notification strings for. */
export const SUPPORTED_LANGUAGES = Object.keys(CATALOGS);

export const DEFAULT_LANGUAGE = "en";

/** Coerce any stored/foreign value to a supported language, falling back to en. */
export function normalizeLanguage(lang: string | null | undefined): string {
  if (lang && CATALOGS[lang]) return lang;
  return DEFAULT_LANGUAGE;
}

/** Look up a dotted key path (e.g. "expenseDue.title") in a catalog. */
function lookup(catalog: Catalog, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as object)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

/** Replace {{param}} placeholders; leaves unknown placeholders intact. */
function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Translate one key into the given language. Falls back to English, then to the
 * raw key, so a missing translation degrades gracefully instead of throwing.
 */
export function translate(
  lang: string | null | undefined,
  key: string,
  params?: Record<string, string | number>
): string {
  const normalized = normalizeLanguage(lang);
  const raw =
    lookup(CATALOGS[normalized], key) ??
    lookup(CATALOGS[DEFAULT_LANGUAGE], key) ??
    key;
  return interpolate(raw, params);
}

/** Resolve a language-independent message into a deliverable payload. */
export function resolveMessage(
  message: ReminderMessage,
  lang: string | null | undefined
): NotificationPayload {
  return {
    dedupeKey: message.dedupeKey,
    category: message.category,
    title: translate(lang, message.titleKey, message.params),
    body: translate(lang, message.bodyKey, message.params),
    url: message.url,
  };
}
