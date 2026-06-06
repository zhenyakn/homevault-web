/**
 * Backend-agnostic file storage interface.
 *
 * Three production implementations exist:
 *   - LocalBackend  (files on the server's own disk / a mounted volume — zero
 *     external setup; ideal for Docker self-host and the Home Assistant add-on)
 *   - S3Backend  (Cloudflare R2, AWS S3, Backblaze B2, MinIO …)
 *   - GoogleDriveBackend  (one-time OAuth with the app owner's Google account)
 *
 * Backends are accessed exclusively through `resolveActiveBackend()` (DB-aware)
 * or `getBackendByName()` (for a stored per-file backend) — never imported
 * directly by routes or routers. The active selection is driven by the
 * `storage.activeBackend` app-setting, then `STORAGE_BACKEND` env, then auto-
 * detection.
 */

export type StorageBackendName = "s3" | "gdrive" | "local";

export interface UploadMeta {
  ownerUserId: number;
  // The currently-active property the file is being attached to. Drive uses
  // it to compute the folder layout (HomeVault/property-<id>/<userId>/…) and
  // the `files` table records it for the file-browser UI. S3 ignores it.
  propertyId: number;
  originalName: string;
  mimeType: string;
}

export type DownloadResult =
  // Stream the content back through the app server.
  | {
      kind: "stream";
      stream: NodeJS.ReadableStream;
      mimeType: string;
      size?: number;
    }
  // Browser should follow a 302 to a short-lived URL (S3 presigned URL).
  | { kind: "redirect"; url: string; mimeType: string };

export interface StorageBackend {
  readonly name: StorageBackendName;

  upload(buffer: Buffer, meta: UploadMeta): Promise<{ externalId: string }>;

  download(externalId: string): Promise<DownloadResult>;

  delete(externalId: string): Promise<void>;
}

/** Thrown when a backend has not been configured (missing env vars, missing
 * OAuth token, etc). Routes catch this and surface a clear user-facing error.
 */
export class StorageNotConfiguredError extends Error {
  readonly code = "STORAGE_NOT_CONFIGURED" as const;
  constructor(message: string) {
    super(message);
    this.name = "StorageNotConfiguredError";
  }
}

/** Thrown when a backend's external service returns an error (network, auth,
 * quota, etc). Wrapped so the upload route can distinguish config vs runtime.
 */
export class StorageOperationError extends Error {
  readonly code = "STORAGE_OPERATION_FAILED" as const;
  readonly backend: StorageBackendName;
  readonly cause?: unknown;
  constructor(backend: StorageBackendName, message: string, cause?: unknown) {
    super(message);
    this.name = "StorageOperationError";
    this.backend = backend;
    this.cause = cause;
  }
}
