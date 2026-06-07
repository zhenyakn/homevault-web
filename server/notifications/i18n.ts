/**
 * Server-side notification i18n — translates a language-independent
 * `ReminderMessage` (i18n key + params) into the resolved `NotificationPayload`
 * (literal title/body) that the channels and delivery log consume.
 *
 * Self-contained: the message catalog lives in ./locales/*.json so the server
 * doesn't reach into the client bundle. Lookup/interpolation/fallback come from
 * the shared, dependency-free translator in ../_core/i18n.
 */

import { createTranslator } from "../_core/i18n";
import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";
import type { NotificationPayload, ReminderMessage } from "./types";

const translator = createTranslator({ en, he, ru });

export const { translate, normalizeLanguage } = translator;

/** Languages we ship server-side notification strings for. */
export const SUPPORTED_LANGUAGES = translator.supportedLanguages;

export const DEFAULT_LANGUAGE = translator.defaultLanguage;

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
