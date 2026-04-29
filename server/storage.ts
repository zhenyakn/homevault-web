/**
 * Unified storage layer — works with two backends:
 *
 *  1. Built-in Forge  (when BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY are set)
 *
 *  2. Any S3-compatible provider  (when STORAGE_ENDPOINT + credentials are set)
 *     Cloudflare R2 free tier recommended for independent deploys:
 *       10 GB free storage, zero egress fees, 1M writes + 10M reads/month free.
 *     Also works with: AWS S3, Backblaze B2, DigitalOcean Spaces, Oracle OCI,
 *     MinIO, or any other S3-compatible service.
 *
 * Required env vars for S3-compatible mode:
 *   STORAGE_ENDPOINT        — e.g. https://ACCOUNT_ID.r2.cloudflarestorage.com
 *   STORAGE_BUCKET          — e.g. homevault
 *   STORAGE_ACCESS_KEY_ID   — R2/S3 access key
 *   STORAGE_SECRET_ACCESS_KEY — R2/S3 secret key
 *   STORAGE_REGION          — e.g. auto (R2) or us-east-1 (S3)
 *   STORAGE_PUBLIC_URL      — public base URL for serving files
 *                             e.g. https://pub-xxx.r2.dev  or  https://files.yourdomain.com
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Backend detection ────────────────────────────────────────────────────────

function useForgeBackend(): boolean {
  return !!(process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY);
}

function getS3Client(): S3Client {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.STORAGE_REGION || "auto";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "[Storage] No storage backend configured.\n" +
      "  Option A (Forge): set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY\n" +
      "  Option B (S3/R2): set STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY\n" +
      "  See .env.example for details."
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Required for path-style URLs (Cloudflare R2, MinIO, etc.)
    forcePathStyle: endpoint.includes("localhost") || endpoint.includes("minio"),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function getPublicUrl(key: string): string {
  const base = process.env.STORAGE_PUBLIC_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "[Storage] STORAGE_PUBLIC_URL is required to serve files. " +
      "Set it to your R2 public bucket URL or custom domain."
    );
  }
  return `${base}/${key}`;
}

// ─── Forge backend ────────────────────────────────────────────────────────────

async function forgeStoragePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL!.replace(/\/+$/, "");
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY!;

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`[Storage] Forge presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("[Storage] Forge returned empty presign URL");

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as Uint8Array], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`[Storage] Forge upload failed (${uploadResp.status})`);
  }

  return { key, url: `/forge-storage/${key}` };
}

async function forgeStorageGetSignedUrl(key: string): Promise<string> {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL!.replace(/\/+$/, "");
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY!;

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`[Storage] Forge signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

// ─── S3-compatible backend (R2, B2, S3, etc.) ────────────────────────────────

async function s3StoragePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("[Storage] STORAGE_BUCKET is not set");

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body as Buffer,
    ContentType: contentType,
  }));

  return { key, url: getPublicUrl(key) };
}

async function s3StorageGetSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("[Storage] STORAGE_BUCKET is not set");

  return await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

async function s3StorageDelete(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new Error("[Storage] STORAGE_BUCKET is not set");

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// ─── Public API (backend-agnostic) ───────────────────────────────────────────

/**
 * Upload a file. Returns the storage key and a public URL to serve it.
 * Key is auto-suffixed with a random hash to prevent collisions.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (useForgeBackend()) return forgeStoragePut(key, data, contentType);
  return s3StoragePut(key, data, contentType);
}

/**
 * Get the public URL for an already-stored key.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (useForgeBackend()) return { key, url: `/forge-storage/${key}` };
  return { key, url: getPublicUrl(key) };
}

/**
 * Get a short-lived signed URL for private file access.
 */
export async function storageGetSignedUrl(
  relKey: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const key = normalizeKey(relKey);
  if (useForgeBackend()) return forgeStorageGetSignedUrl(key);
  return s3StorageGetSignedUrl(key, expiresInSeconds);
}

/**
 * Delete a file from storage.
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  if (useForgeBackend()) {
    // Forge backend doesn't expose a delete API — log and skip
    console.warn(`[Storage] Forge backend does not support delete. Key: ${key}`);
    return;
  }
  await s3StorageDelete(key);
}
