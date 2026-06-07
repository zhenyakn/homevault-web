import { describe, it, expect } from "vitest";
import { createTranslator, lookup, interpolate } from "./i18n";

describe("lookup", () => {
  it("resolves dotted paths and returns undefined for misses", () => {
    const cat = { a: { b: "x" }, c: "y" };
    expect(lookup(cat, "a.b")).toBe("x");
    expect(lookup(cat, "c")).toBe("y");
    expect(lookup(cat, "a")).toBeUndefined(); // object, not a string
    expect(lookup(cat, "a.z")).toBeUndefined();
    expect(lookup(cat, "nope")).toBeUndefined();
  });
});

describe("interpolate", () => {
  it("replaces known placeholders and leaves unknown ones intact", () => {
    expect(interpolate("Hi {{name}}", { name: "A" })).toBe("Hi A");
    expect(interpolate("{{a}}/{{b}}", { a: 1 })).toBe("1/{{b}}");
    expect(interpolate("none")).toBe("none");
  });
});

describe("createTranslator", () => {
  const t = createTranslator({
    en: { greet: "Hello {{n}}" },
    ru: { greet: "Привет {{n}}" },
  });

  it("translates in the chosen language", () => {
    expect(t.translate("ru", "greet", { n: "X" })).toBe("Привет X");
  });

  it("normalizes unsupported languages to the default", () => {
    expect(t.normalizeLanguage("fr")).toBe("en");
    expect(t.translate("fr", "greet", { n: "X" })).toBe("Hello X");
    expect(t.normalizeLanguage(null)).toBe("en");
  });

  it("falls back to the key when missing everywhere", () => {
    expect(t.translate("en", "missing")).toBe("missing");
  });

  it("exposes the supported languages", () => {
    expect(t.supportedLanguages).toEqual(["en", "ru"]);
  });
});
