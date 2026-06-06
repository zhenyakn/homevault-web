import { describe, it, expect } from "vitest";
import {
  formatPlainText,
  formatEmailSubject,
  formatEmailHtml,
} from "./format";
import type { NotificationPayload } from "./types";

const payload: NotificationPayload = {
  dedupeKey: "k",
  category: "expense",
  title: "Expense due soon",
  body: "Water (100) is due.",
  url: "/expenses",
};

describe("formatPlainText", () => {
  it("combines title and body on separate lines", () => {
    expect(formatPlainText(payload)).toBe("Expense due soon\nWater (100) is due.");
  });
});

describe("formatEmailSubject", () => {
  it("is the title", () => {
    expect(formatEmailSubject(payload)).toBe("Expense due soon");
  });
});

describe("formatEmailHtml", () => {
  it("includes the title and body", () => {
    const html = formatEmailHtml(payload);
    expect(html).toContain("Expense due soon");
    expect(html).toContain("Water (100) is due.");
  });

  it("builds an absolute hash link from a base url", () => {
    const html = formatEmailHtml(payload, "https://home.example.com/");
    expect(html).toContain('href="https://home.example.com/#/expenses"');
  });

  it("escapes HTML in user content", () => {
    const html = formatEmailHtml({
      ...payload,
      title: "<script>x</script>",
      body: "a & b < c",
      url: undefined,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
  });

  it("omits the link when there is no url", () => {
    const html = formatEmailHtml({ ...payload, url: undefined });
    expect(html).not.toContain("View in HomeVault");
  });
});
