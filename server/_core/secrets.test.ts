import { describe, expect, it, beforeEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncryptedEnvelope,
  readMaybeEncrypted,
  _resetKekForTests,
} from "./secrets";

beforeEach(() => {
  // Stable, long-enough secret. test-setup.ts sets one too but be explicit.
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hkdf";
  _resetKekForTests();
});

describe("encryptSecret + decryptSecret round-trip", () => {
  it("round-trips a typical refresh token", () => {
    const plain = "1//0g-very-long-refresh-token-from-google-PfZ_x";
    const env = encryptSecret(plain);
    expect(env.startsWith("v1:")).toBe(true);
    expect(env).not.toContain(plain);
    expect(decryptSecret(env)).toBe(plain);
  });

  it("round-trips short and empty strings", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
    expect(decryptSecret(encryptSecret("a"))).toBe("a");
  });

  it("produces different ciphertext each call (random nonce)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toEqual(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("supports unicode payloads", () => {
    const plain = "user+דוגמה@example.com — token😀";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });
});

describe("isEncryptedEnvelope", () => {
  it("recognises a v1 envelope", () => {
    expect(isEncryptedEnvelope(encryptSecret("x"))).toBe(true);
  });
  it("rejects plaintext", () => {
    expect(isEncryptedEnvelope("hello")).toBe(false);
    expect(isEncryptedEnvelope("v2:something")).toBe(false);
    expect(isEncryptedEnvelope("")).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope(undefined)).toBe(false);
  });
});

describe("readMaybeEncrypted (legacy migration)", () => {
  it("returns null for null/undefined", () => {
    expect(readMaybeEncrypted(null)).toBeNull();
    expect(readMaybeEncrypted(undefined)).toBeNull();
  });
  it("returns plaintext as-is when no envelope prefix", () => {
    expect(readMaybeEncrypted("legacy-token")).toBe("legacy-token");
  });
  it("decrypts envelope values", () => {
    expect(readMaybeEncrypted(encryptSecret("rt"))).toBe("rt");
  });
});

describe("tamper detection", () => {
  it("rejects a flipped bit in the ciphertext (GCM tag mismatch)", () => {
    const env = encryptSecret("rt-secret");
    const parts = env.split(":");
    // Flip the last char of the sealed segment.
    const sealed = parts[2];
    const lastChar = sealed.at(-1)!;
    const flipped = sealed.slice(0, -1) + (lastChar === "A" ? "B" : "A");
    const tampered = `${parts[0]}:${parts[1]}:${flipped}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects truncated envelopes", () => {
    expect(() => decryptSecret("v1:short")).toThrow();
    expect(() => decryptSecret("v1::")).toThrow();
  });

  it("rejects unknown version prefix", () => {
    expect(() => decryptSecret("v9:abc:def")).toThrow(/unknown envelope version/);
  });

  it("rejects a different KEK (e.g. JWT_SECRET rotated)", () => {
    const env = encryptSecret("rt");
    process.env.JWT_SECRET = "completely-different-secret-string";
    _resetKekForTests();
    expect(() => decryptSecret(env)).toThrow();
  });
});
