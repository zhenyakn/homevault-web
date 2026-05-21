import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "crypto";

/**
 * AES-256-GCM envelope for at-rest secrets.
 *
 * Used to encrypt sensitive values stored in the generic `app_settings` table
 * (e.g. the Google Drive refresh token) so a database leak / dump / accidental
 * log capture doesn't yield long-lived OAuth credentials.
 *
 * Key derivation:
 *   KEK = HKDF-SHA256(JWT_SECRET, salt="homevault.app_settings.v1", info=<purpose>)
 *
 * The KEK is bound to the existing JWT_SECRET (already mandatory at boot, see
 * server/_core/env.ts) — no new env var to manage. Rotating JWT_SECRET will
 * invalidate every stored ciphertext, which is the desired property: rotating
 * the master secret should force a re-auth.
 *
 * Storage format:
 *   v1:<base64url(nonce)>:<base64url(ciphertext||authTag)>
 *
 * The leading `v1:` prefix lets us migrate forward (v2 with a different
 * algorithm or key schedule) without losing readability of existing rows.
 */

const ENVELOPE_VERSION = "v1";
const PURPOSE = "app_settings";
const SALT = `homevault.${PURPOSE}.${ENVELOPE_VERSION}`;
const NONCE_BYTES = 12; // AES-GCM standard
const KEY_BYTES = 32; // AES-256

let _kek: Buffer | null = null;
let _kekFromSecret: string | null = null;

function getKek(): Buffer {
  // Read from process.env (not ENV) so rotating JWT_SECRET at runtime is
  // honoured. ENV captures the value at module load and is otherwise too
  // sticky for honest key derivation.
  const secret = process.env.JWT_SECRET || "";
  if (!secret || secret.length < 16) {
    throw new Error(
      "[secrets] JWT_SECRET must be set and >=16 chars before secrets.ts is used"
    );
  }
  if (_kek && _kekFromSecret === secret) return _kek;
  const derived = hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from(SALT, "utf8"),
    Buffer.from(PURPOSE, "utf8"),
    KEY_BYTES
  );
  _kek = Buffer.from(derived);
  _kekFromSecret = secret;
  return _kek;
}

/** Test hook — forces re-derivation on next call. NEVER call in production code. */
export function _resetKekForTests() {
  _kek = null;
  _kekFromSecret = null;
}

export function isEncryptedEnvelope(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${ENVELOPE_VERSION}:`);
}

/**
 * Encrypts `plaintext` into a self-describing envelope string. Safe to call
 * with arbitrary UTF-8 input (refresh tokens, emails, folder IDs).
 */
export function encryptSecret(plaintext: string): string {
  const key = getKek();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Concatenate ciphertext + 16-byte tag and base64url-encode.
  const sealed = Buffer.concat([enc, tag]).toString("base64url");
  return `${ENVELOPE_VERSION}:${nonce.toString("base64url")}:${sealed}`;
}

/**
 * Reverse of `encryptSecret`. Throws if the envelope is malformed, version is
 * unrecognised, or the GCM auth tag check fails (tamper detection).
 *
 * Callers MUST treat a thrown error as "secret is unreadable" — typically by
 * forcing a re-connect rather than logging the raw envelope.
 */
export function decryptSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 3)
    throw new Error("[secrets] malformed envelope: expected 3 parts");
  const [version, nonceB64, sealedB64] = parts;
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`[secrets] unknown envelope version: ${version}`);
  }
  const nonce = Buffer.from(nonceB64, "base64url");
  const sealed = Buffer.from(sealedB64, "base64url");
  if (sealed.length < 16)
    throw new Error("[secrets] ciphertext too short for GCM tag");
  const ct = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);

  const key = getKek();
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * Best-effort read: if the value already looks encrypted, decrypt it; otherwise
 * treat as legacy plaintext and return as-is. Used by the gdrive callers to
 * migrate forward without a SQL data migration.
 */
export function readMaybeEncrypted(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  if (!isEncryptedEnvelope(value)) return value;
  return decryptSecret(value);
}
