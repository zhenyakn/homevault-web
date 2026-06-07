/**
 * Telegram bot i18n — reply strings in each supported language. Built on the
 * shared translator (../_core/i18n); the bot resolves the recipient's language
 * from their linked user row and passes it to `t`.
 */

import { createTranslator } from "../_core/i18n";
import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

const translator = createTranslator({ en, he, ru });

export const { translate: t, normalizeLanguage } = translator;
export const SUPPORTED_LANGUAGES = translator.supportedLanguages;
