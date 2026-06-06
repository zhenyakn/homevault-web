import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import type { StorageBackend, UploadMeta, DownloadResult } from "./types";
import { StorageNotConfiguredError, StorageOperationError } from "./types";
import { getSetting, setSetting } from "../db/appSettings";
import { encryptSecret, readMaybeEncrypted } from "../_core/secrets";

/**
 * S3-compatible storage backend (Cloudflare R2, AWS S3, B2, MinIO, …).
 *
 * On `download()` returns a redirect to a short-lived presigned URL rather
 * than streaming through the app server — S3 traffic is what S3 is for.
 *
 * Configuration can come from env vars OR from `app_settings` (so an admin can
 * paste credentials into Settings → File Storage without editing `.env` or
 * restarting). Each field is resolved env-first, then the DB override — mirrors
 * how the Google Drive backend reads its credentials.
 */

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — matches /api/files cache

// `app_settings` keys for the UI-managed config. The secret is encrypted at
// rest with the same AES-256-GCM envelope the Drive refresh token uses.
export const S3_KEYS = {
  endpoint: "storage.s3.endpoint",
  bucket: "storage.s3.bucket",
  region: "storage.s3.region",
  accessKeyId: "storage.s3.accessKeyId",
  secretAccessKey: "storage.s3.secretAccessKey",
} as const;

interface S3Config {
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region: string;
}

function readEnv() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.STORAGE_REGION || "auto";
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

/** Env-only check — used by the synchronous auto-detect fallback. */
export function isS3Configured(): boolean {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = readEnv();
  return !!(endpoint && bucket && accessKeyId && secretAccessKey);
}

async function getDbSetting(key: string): Promise<string | null> {
  try {
    return await getSetting(key);
  } catch {
    // DB unreachable — behave as if unset so env-only installs keep working.
    return null;
  }
}

/** Resolve the effective S3 config: env value per field, else DB override. */
async function loadConfig(): Promise<S3Config> {
  const env = readEnv();
  const [endpoint, bucket, region, accessKeyId, secretRaw] = await Promise.all([
    env.endpoint
      ? Promise.resolve(env.endpoint)
      : getDbSetting(S3_KEYS.endpoint),
    env.bucket ? Promise.resolve(env.bucket) : getDbSetting(S3_KEYS.bucket),
    process.env.STORAGE_REGION
      ? Promise.resolve(process.env.STORAGE_REGION)
      : getDbSetting(S3_KEYS.region),
    env.accessKeyId
      ? Promise.resolve(env.accessKeyId)
      : getDbSetting(S3_KEYS.accessKeyId),
    env.secretAccessKey
      ? Promise.resolve(env.secretAccessKey)
      : getDbSetting(S3_KEYS.secretAccessKey),
  ]);
  let secretAccessKey = secretRaw ?? undefined;
  if (secretAccessKey && !env.secretAccessKey) {
    try {
      secretAccessKey = readMaybeEncrypted(secretAccessKey) ?? undefined;
    } catch {
      secretAccessKey = undefined;
    }
  }
  return {
    endpoint: endpoint ?? undefined,
    bucket: bucket ?? undefined,
    accessKeyId: accessKeyId ?? undefined,
    secretAccessKey,
    region: region || "auto",
  };
}

/** Env-or-DB check for the status endpoint / active-backend resolution. */
export async function isS3ConfiguredAsync(): Promise<boolean> {
  const c = await loadConfig();
  return !!(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

/** Masked status summary for the Settings UI (never throws). */
export async function getS3Status(): Promise<{
  configured: boolean;
  endpoint: string | null;
  bucket: string | null;
  region: string;
  secretExists: boolean;
  fromEnv: boolean;
}> {
  const c = await loadConfig();
  return {
    configured: !!(
      c.endpoint &&
      c.bucket &&
      c.accessKeyId &&
      c.secretAccessKey
    ),
    endpoint: c.endpoint ?? null,
    bucket: c.bucket ?? null,
    region: c.region,
    secretExists: !!c.secretAccessKey,
    fromEnv: isS3Configured(),
  };
}

/**
 * Persist S3 credentials from the admin Settings form. The secret is encrypted
 * at rest; passing `undefined` for it keeps the existing stored secret (so an
 * admin editing endpoint/bucket doesn't have to re-enter the key).
 */
export async function saveS3Config(input: {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey?: string;
}): Promise<void> {
  await Promise.all([
    setSetting(S3_KEYS.endpoint, input.endpoint.trim()),
    setSetting(S3_KEYS.bucket, input.bucket.trim()),
    setSetting(S3_KEYS.region, (input.region || "auto").trim()),
    setSetting(S3_KEYS.accessKeyId, input.accessKeyId.trim()),
  ]);
  if (input.secretAccessKey?.trim()) {
    await setSetting(
      S3_KEYS.secretAccessKey,
      encryptSecret(input.secretAccessKey.trim())
    );
  }
}

function buildClient(c: S3Config): { client: S3Client; bucket: string } {
  if (!c.endpoint || !c.bucket || !c.accessKeyId || !c.secretAccessKey) {
    throw new StorageNotConfiguredError(
      "S3 storage is not configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET, " +
        "STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY (or fill them in " +
        "Settings → File Storage)."
    );
  }
  const client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
    // Required for path-style URLs on local MinIO / localstack
    forcePathStyle:
      c.endpoint.includes("localhost") || c.endpoint.includes("minio"),
  });
  return { client, bucket: c.bucket };
}

async function getClient(): Promise<{ client: S3Client; bucket: string }> {
  return buildClient(await loadConfig());
}

/**
 * Verify connectivity with a HeadBucket call against the (optionally candidate)
 * credentials. Returns a structured result for the Settings "Test" button.
 */
export async function testS3(candidate?: {
  endpoint: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    let cfg: S3Config;
    if (candidate?.endpoint) {
      let secret = candidate.secretAccessKey?.trim();
      if (!secret) {
        // No new secret supplied — reuse the stored one so "Test" works after
        // an admin edits only the endpoint/bucket.
        const stored = await getDbSetting(S3_KEYS.secretAccessKey);
        secret = stored ? (readMaybeEncrypted(stored) ?? undefined) : undefined;
      }
      cfg = {
        endpoint: candidate.endpoint.trim(),
        bucket: candidate.bucket.trim(),
        region: (candidate.region || "auto").trim(),
        accessKeyId: candidate.accessKeyId.trim(),
        secretAccessKey: secret,
      };
    } else {
      cfg = await loadConfig();
    }
    const { client, bucket } = buildClient(cfg);
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function buildKey(ownerUserId: number, originalName: string): string {
  // 8-char random suffix prevents collisions when the same name is uploaded
  // twice (matches the previous behaviour of storage.ts:appendHashSuffix).
  const hash = crypto.randomBytes(4).toString("hex");
  const safe = originalName.replace(/[^\w.\-]+/g, "_");
  const lastDot = safe.lastIndexOf(".");
  const stamped =
    lastDot === -1
      ? `${safe}_${hash}`
      : `${safe.slice(0, lastDot)}_${hash}${safe.slice(lastDot)}`;
  return `uploads/${ownerUserId}/${Date.now()}_${stamped}`;
}

export const s3Backend: StorageBackend = {
  name: "s3",

  async upload(buffer: Buffer, meta: UploadMeta) {
    const { client, bucket } = await getClient();
    const key = buildKey(meta.ownerUserId, meta.originalName);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: meta.mimeType,
        })
      );
      return { externalId: key };
    } catch (err) {
      throw new StorageOperationError(
        "s3",
        `S3 upload failed: ${(err as Error).message}`,
        err
      );
    }
  },

  async download(externalId: string): Promise<DownloadResult> {
    const { client, bucket } = await getClient();
    try {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: externalId }),
        { expiresIn: SIGNED_URL_TTL_SECONDS }
      );
      // We don't know the stored mimeType at this layer; the route reads it
      // from the `files` table and uses it for the Content-Type header on
      // the proxy response — for redirects the browser follows directly so
      // the value here is informational only.
      return { kind: "redirect", url, mimeType: "application/octet-stream" };
    } catch (err) {
      throw new StorageOperationError(
        "s3",
        `S3 signed-URL failed: ${(err as Error).message}`,
        err
      );
    }
  },

  async delete(externalId: string): Promise<void> {
    const { client, bucket } = await getClient();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: externalId })
      );
    } catch (err) {
      throw new StorageOperationError(
        "s3",
        `S3 delete failed: ${(err as Error).message}`,
        err
      );
    }
  },
};
