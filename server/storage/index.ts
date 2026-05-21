import { s3Backend, isS3Configured } from "./s3";
import { gdriveBackend, isGoogleEnvConfigured } from "./gdrive";
import type { StorageBackend, StorageBackendName } from "./types";
import { StorageNotConfiguredError } from "./types";

/**
 * Backend selection:
 *   - STORAGE_BACKEND=gdrive   →  Google Drive
 *   - STORAGE_BACKEND=s3       →  S3-compatible
 *   - (unset)                  →  Auto: gdrive if Google env is set, else s3
 *
 * The selection is resolved on each call so test setups can flip env vars
 * between tests without restarting the module.
 */
export function getActiveBackendName(): StorageBackendName {
  const explicit = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (explicit === "gdrive" || explicit === "s3") return explicit;
  if (isGoogleEnvConfigured()) return "gdrive";
  if (isS3Configured()) return "s3";
  // Default to gdrive — surfaces a more actionable error message at the
  // upload route (telling the user to visit Settings → Integrations).
  return "gdrive";
}

export function getActiveBackend(): StorageBackend {
  const name = getActiveBackendName();
  if (name === "s3") return s3Backend;
  if (name === "gdrive") return gdriveBackend;
  // Exhaustiveness guard — unreachable given the type narrow above.
  throw new StorageNotConfiguredError(`Unknown STORAGE_BACKEND: ${name}`);
}

export function getBackendByName(name: StorageBackendName): StorageBackend {
  if (name === "s3") return s3Backend;
  if (name === "gdrive") return gdriveBackend;
  throw new StorageNotConfiguredError(`Unknown storage backend: ${name}`);
}

export { s3Backend, gdriveBackend };
export type {
  StorageBackend,
  StorageBackendName,
  UploadMeta,
  DownloadResult,
} from "./types";
export { StorageNotConfiguredError, StorageOperationError } from "./types";
