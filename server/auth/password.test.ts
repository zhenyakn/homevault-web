import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
} from "./password";

describe("password hashing (scrypt)", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true
    );
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("samePassword");
    const b = await hashPassword("samePassword");
    expect(a).not.toBe(b);
    expect(await verifyPassword("samePassword", a)).toBe(true);
    expect(await verifyPassword("samePassword", b)).toBe(true);
  });

  it("returns false for a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "notscrypt$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("single-use tokens", () => {
  it("hashes deterministically and uniquely per token", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1.raw).not.toBe(t2.raw);
    expect(t1.hash).toBe(hashToken(t1.raw));
    expect(t1.hash).not.toBe(t2.hash);
    // The stored hash is not the raw token.
    expect(t1.hash).not.toBe(t1.raw);
  });
});
