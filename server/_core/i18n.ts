/**
 * Generic server-side i18n primitives — PURE, dependency-free, unit-tested
 * (i18n.test.ts). `createTranslator` builds a small translator bound to a set of
 * language catalogs; feature areas (notifications, the Telegram bot) supply
 * their own catalogs and get key lookup + {{param}} interpolation + graceful
 * fallback (chosen language → default language → the raw key).
 */

export type Catalog = Record<string, unknown>;

/** Look up a dotted key path (e.g. "expenseDue.title") in a catalog. */
export function lookup(catalog: Catalog, key: string): string | undefined {
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
export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

export type Translator = {
  /** Translate a key into `lang` with optional interpolation params. */
  translate: (
    lang: string | null | undefined,
    key: string,
    params?: Record<string, string | number>
  ) => string;
  /** Coerce any value to a supported language, falling back to the default. */
  normalizeLanguage: (lang: string | null | undefined) => string;
  /** Languages the catalogs cover. */
  supportedLanguages: string[];
  defaultLanguage: string;
};

/** Build a translator over `catalogs`, keyed by language code. */
export function createTranslator(
  catalogs: Record<string, Catalog>,
  defaultLanguage = "en"
): Translator {
  const supportedLanguages = Object.keys(catalogs);

  function normalizeLanguage(lang: string | null | undefined): string {
    return lang && catalogs[lang] ? lang : defaultLanguage;
  }

  function translate(
    lang: string | null | undefined,
    key: string,
    params?: Record<string, string | number>
  ): string {
    const normalized = normalizeLanguage(lang);
    const raw =
      lookup(catalogs[normalized], key) ??
      lookup(catalogs[defaultLanguage], key) ??
      key;
    return interpolate(raw, params);
  }

  return { translate, normalizeLanguage, supportedLanguages, defaultLanguage };
}
