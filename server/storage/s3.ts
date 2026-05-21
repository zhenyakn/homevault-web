import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import type { StorageBackend, UploadMeta, DownloadResult } from "./types";
import { StorageNotConfiguredError, StorageOperationError } from "./types";

/**
 * S3-compatible storage backend (Cloudflare R2, AWS S3, B2, MinIO, …).
 *
 * On `download()` returns a redirect to a short-lived presigned URL rather
 * than streaming through the app server — S3 traffic is what S3 is for.
 */

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — matches /api/files cache

function readEnv() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.STORAGE_REGION || "auto";
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

export function isS3Configured(): boolean {
  const { endpoint, bucket, accessKeyId, secretAccessKey } = readEnv();
  return !!(endpoint && bucket && accessKeyId && secretAccessKey);
}

function getClient(): { client: S3Client; bucket: string } {
  const { endpoint, bucket, accessKeyId, secretAccessKey, region } = readEnv();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new StorageNotConfiguredError(
      "S3 storage is not configured. Set STORAGE_ENDPOINT, STORAGE_BUCKET, " +
        "STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY in your .env file."
    );
  }
  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Required for path-style URLs on local MinIO / localstack
    forcePathStyle:
      endpoint.includes("localhost") || endpoint.includes("minio"),
  });
  return { client, bucket };
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
    const { client, bucket } = getClient();
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
    const { client, bucket } = getClient();
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
    const { client, bucket } = getClient();
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
