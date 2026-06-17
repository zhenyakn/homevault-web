import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

/**
 * Hash a password with scrypt (built into Node — no native dependency). The
 * encoded form is `scrypt$<saltHex>$<keyHex>` so the salt travels with the hash
 * and `verifyPassword` is self-contained.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Constant-time verification of a password against an encoded scrypt hash. */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = await scrypt(password, salt, expected.length || KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Generate a single-use token for email verification / password reset. The raw
 * value is returned to embed in the emailed link; only its hash is stored.
 */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** SHA-256 of a token, hex-encoded — what we persist (never the raw token). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
