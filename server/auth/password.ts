import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

type ScryptOpts = { N: number; r: number; p: number; maxmem: number };

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOpts
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

// Current work factor. scrypt is deliberately used over argon2/bcrypt so the
// Home Assistant add-on stays free of native dependencies (cross-arch builds).
// Memory ≈ 128 * N * r bytes ≈ 64 MB at these params, so maxmem is raised to
// match. Bumping COST.N here automatically upgrades existing hashes on the
// owner's next login (see needsRehash + the login/changePassword call sites).
const COST: ScryptOpts = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

// Params assumed for legacy hashes stored before the cost factor was encoded
// (the old `scrypt$<salt>$<key>` 3-field form).
const LEGACY: ScryptOpts = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Hash a password with scrypt. The encoded form carries the salt *and* the work
 * factor — `scrypt$N$r$p$<saltHex>$<keyHex>` — so verification is self-contained
 * and the cost can be raised over time without orphaning old hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEYLEN, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Parse an encoded hash into its params + raw bytes, tolerating the legacy form. */
function parseStored(
  stored: string
): { opts: ScryptOpts; salt: Buffer; expected: Buffer } | null {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  // New form: scrypt$N$r$p$salt$key
  if (parts.length === 6) {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!N || !r || !p) return null;
    return {
      opts: { N, r, p, maxmem: 256 * 1024 * 1024 },
      salt: Buffer.from(parts[4], "hex"),
      expected: Buffer.from(parts[5], "hex"),
    };
  }
  // Legacy form: scrypt$salt$key (Node default cost).
  if (parts.length === 3) {
    return {
      opts: LEGACY,
      salt: Buffer.from(parts[1], "hex"),
      expected: Buffer.from(parts[2], "hex"),
    };
  }
  return null;
}

/** Constant-time verification of a password against an encoded scrypt hash. */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  const { opts, salt, expected } = parsed;
  const actual = await scrypt(
    password,
    salt,
    expected.length || KEYLEN,
    opts
  );
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Whether a stored hash was produced with a weaker work factor than the current
 * one (or the legacy paramless form) and should be transparently re-hashed the
 * next time the plaintext is available (i.e. on a successful login).
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) return true;
  return parsed.opts.N < COST.N || parsed.opts.r < COST.r;
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
