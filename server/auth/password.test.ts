import { describe, it, expect } from "vitest";
import { scryptSync } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
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

  it("verifies a legacy (paramless) hash and flags it for rehash", async () => {
    // Emulate the old `scrypt$<salt>$<key>` form at Node's default cost.
    const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const key = scryptSync("legacypw", salt, 64);
    const legacy = `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
    expect(await verifyPassword("legacypw", legacy)).toBe(true);
    expect(await verifyPassword("nope", legacy)).toBe(false);
    // Legacy hashes are below the current work factor → rehash on next login.
    expect(needsRehash(legacy)).toBe(true);
  });

  it("does not flag a freshly-hashed password for rehash", async () => {
    const hash = await hashPassword("fresh-password-1");
    expect(needsRehash(hash)).toBe(false);
    // The encoded form now carries the work factor: scrypt$N$r$p$salt$key.
    expect(hash.split("$")).toHaveLength(6);
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
