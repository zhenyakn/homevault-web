import { describe, it, expect } from "vitest";
import {
  translate,
  resolveMessage,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from "./i18n";
import type { ReminderMessage } from "./types";

describe("normalizeLanguage", () => {
  it("keeps supported languages and falls back to en otherwise", () => {
    expect(normalizeLanguage("ru")).toBe("ru");
    expect(normalizeLanguage("he")).toBe("he");
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage("fr")).toBe("en");
  });

  it("ships en, he and ru catalogs", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(
      expect.arrayContaining(["en", "he", "ru"])
    );
  });
});

describe("translate", () => {
  it("interpolates params into the chosen language", () => {
    expect(
      translate("en", "expenseDue.body", {
        name: "Water",
        amount: 100,
        date: "2026-06-08",
      })
    ).toBe("Water (100) is due on 2026-06-08.");
    expect(translate("ru", "expenseDue.title")).toBe("Скоро срок расхода");
  });

  it("falls back to English for an unknown language", () => {
    expect(translate("fr", "test.title")).toBe("HomeVault test notification");
  });

  it("falls back to the key itself when missing everywhere", () => {
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("leaves unknown placeholders intact", () => {
    expect(translate("en", "expenseDue.body", { name: "X" })).toContain(
      "{{amount}}"
    );
  });
});

describe("resolveMessage", () => {
  const message: ReminderMessage = {
    dedupeKey: "expense-due:e1:2026-06-08",
    category: "expense",
    titleKey: "expenseDue.title",
    bodyKey: "expenseDue.body",
    params: { name: "Water", amount: 100, date: "2026-06-08" },
    url: "/expenses",
  };

  it("produces a deliverable payload in the recipient's language", () => {
    const en = resolveMessage(message, "en");
    expect(en).toMatchObject({
      dedupeKey: "expense-due:e1:2026-06-08",
      category: "expense",
      title: "Expense due soon",
      body: "Water (100) is due on 2026-06-08.",
      url: "/expenses",
    });

    const ru = resolveMessage(message, "ru");
    expect(ru.title).toBe("Скоро срок расхода");
    expect(ru.body).toContain("Water");
    expect(ru.body).toContain("2026-06-08");
  });
});
