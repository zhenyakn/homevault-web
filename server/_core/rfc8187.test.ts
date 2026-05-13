import { describe, expect, it } from "vitest";
import { rfc8187Encode, buildContentDisposition } from "./rfc8187";

describe("rfc8187Encode", () => {
  it("passes attr-char unchanged", () => {
    expect(rfc8187Encode("hello_world.PDF")).toBe("hello_world.PDF");
    expect(rfc8187Encode("a1!#$&+-.^_`|~")).toBe("a1!#$&+-.^_`|~");
  });

  it("pct-encodes spaces", () => {
    expect(rfc8187Encode("a b")).toBe("a%20b");
  });

  it("pct-encodes quotes, parens, brackets, commas", () => {
    expect(rfc8187Encode("a(1).pdf")).toBe("a%281%29.pdf");
    expect(rfc8187Encode('"q"')).toBe("%22q%22");
    expect(rfc8187Encode("a,b")).toBe("a%2Cb");
  });

  it("pct-encodes control characters — header injection defense", () => {
    expect(rfc8187Encode("x\r\nSet-Cookie: a=1")).toContain("%0D%0A");
    expect(rfc8187Encode("a\0b")).toBe("a%00b");
  });

  it("encodes multi-byte UTF-8 bytes (Hebrew)", () => {
    // ש = 0xD7 0xA9
    expect(rfc8187Encode("שלום.pdf")).toMatch(/^%D7%A9%D7%9C%D7%95%D7%9D\.pdf$/);
  });

  it("encodes emoji bytes correctly", () => {
    // 😀 = 0xF0 0x9F 0x98 0x80
    expect(rfc8187Encode("😀")).toBe("%F0%9F%98%80");
  });
});

describe("buildContentDisposition", () => {
  it("defaults to attachment disposition", () => {
    const h = buildContentDisposition("file.pdf");
    expect(h.startsWith("attachment;")).toBe(true);
  });

  it("includes both ASCII fallback and UTF-8 form", () => {
    const h = buildContentDisposition("שלום.pdf");
    expect(h).toMatch(/filename="[^"]+"/);
    expect(h).toContain("filename*=UTF-8''");
  });

  it("sanitises the ASCII fallback so CR/LF + quotes cannot break the header", () => {
    const h = buildContentDisposition('evil"\r\nSet-Cookie: a=1.pdf');
    // No raw CR, LF, or unescaped double-quote inside the ASCII filename.
    const ascii = h.match(/filename="([^"]+)"/)![1];
    expect(ascii).not.toContain('"');
    expect(ascii).not.toContain("\r");
    expect(ascii).not.toContain("\n");
  });

  it("falls back to 'file' when input is unprintable", () => {
    const h = buildContentDisposition("\x01\x02\x03");
    expect(h).toContain('filename="___"');
  });

  it("supports inline override", () => {
    expect(buildContentDisposition("x.pdf", "inline").startsWith("inline;")).toBe(true);
  });
});
