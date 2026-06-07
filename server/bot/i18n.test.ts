import { describe, it, expect } from "vitest";
import { t, SUPPORTED_LANGUAGES } from "./i18n";
import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

describe("bot i18n catalogs", () => {
  it("ships en, he and ru", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(
      expect.arrayContaining(["en", "he", "ru"])
    );
  });

  it("he and ru cover exactly the same keys as en", () => {
    const enKeys = flatten(en).sort();
    expect(flatten(he).sort()).toEqual(enKeys);
    expect(flatten(ru).sort()).toEqual(enKeys);
  });

  it("defines every reasonKey the command parser emits", () => {
    for (const key of [
      "usage.link",
      "usage.paid",
      "usage.addexpense",
      "usage.amountPositive",
    ]) {
      // A resolved key returns real text, not the key itself.
      expect(t("en", key)).not.toBe(key);
    }
  });

  it("translates and interpolates per language", () => {
    expect(t("ru", "markedPaid", { name: "Вода" })).toContain("Вода");
    expect(t("he", "btnConfirm")).toBe("אישור");
    expect(t("fr", "btnConfirm")).toBe("Confirm"); // fallback to en
  });
});
