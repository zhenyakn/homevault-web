import {
  s3Backend,
  isS3Configured,
  isS3ConfiguredAsync,
  getS3Status,
  saveS3Config,
  testS3,
} from "./s3";
import {
  gdriveBackend,
  isGoogleEnvConfigured,
  isGoogleConfigured,
} from "./gdrive";
import {
  localBackend,
  isLocalConfigured,
  getLocalStatus,
  saveLocalDir,
  testLocalWritable,
} from "./local";
import type { StorageBackend, StorageBackendName } from "./types";
import { StorageNotConfiguredError } from "./types";
import { getSetting, setSetting } from "../db/appSettings";

/**
 * Backend selection.
 *
 * Two resolvers exist:
 *   - getActiveBackendName()      — synchronous, env-only (STORAGE_BACKEND +
 *     auto-detect). Kept for callers/tests that can't await and don't need the
 *     DB-stored override.
 *   - resolveActiveBackendName()  — asynchronous, DB-aware. The production path
 *     (uploads) uses this so the Settings UI can switch backends live, with
 *     precedence: storage.activeBackend setting > STORAGE_BACKEND env > auto.
 *
 * `getBackendByName()` resolves a *stored* per-file backend name and never
 * touches config — existing Drive/S3/local files keep downloading regardless of
 * which backend is currently active.
 */

const ALL_BACKENDS: StorageBackendName[] = ["gdrive", "s3", "local"];

/** `app_settings` key holding the admin-selected active backend. */
export const ACTIVE_BACKEND_KEY = "storage.activeBackend";

function isValidBackendName(v: string): v is StorageBackendName {
  return (ALL_BACKENDS as string[]).includes(v);
}

export function getActiveBackendName(): StorageBackendName {
  const explicit = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (isValidBackendName(explicit)) return explicit;
  if (isGoogleEnvConfigured()) return "gdrive";
  if (isS3Configured()) return "s3";
  // Default to gdrive — surfaces a more actionable error message at the
  // upload route (telling the user to visit Settings → Integrations).
  return "gdrive";
}

export function getActiveBackend(): StorageBackend {
  return getBackendByName(getActiveBackendName());
}

/**
 * DB-aware active-backend resolution (production path).
 *
 * Precedence:
 *   1. storage.activeBackend app-setting (set from the Settings UI) — live, no
 *      restart.
 *   2. STORAGE_BACKEND env var.
 *   3. Auto-detect: gdrive if its env is set, else S3 if configured (env or DB),
 *      else local — so a zero-config Docker/HA install "just works" on disk
 *      instead of erroring out.
 */
export async function resolveActiveBackendName(): Promise<StorageBackendName> {
  let stored: string | null = null;
  try {
    stored = await getSetting(ACTIVE_BACKEND_KEY);
  } catch {
    stored = null;
  }
  if (stored && isValidBackendName(stored.trim().toLowerCase())) {
    return stored.trim().toLowerCase() as StorageBackendName;
  }
  const explicit = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (isValidBackendName(explicit)) return explicit;
  if (isGoogleEnvConfigured()) return "gdrive";
  if (await isS3ConfiguredAsync()) return "s3";
  return "local";
}

export async function resolveActiveBackend(): Promise<StorageBackend> {
  return getBackendByName(await resolveActiveBackendName());
}

export function getBackendByName(name: StorageBackendName): StorageBackend {
  if (name === "s3") return s3Backend;
  if (name === "gdrive") return gdriveBackend;
  if (name === "local") return localBackend;
  throw new StorageNotConfiguredError(`Unknown storage backend: ${name}`);
}

/** Persist the admin-selected active backend (used by the Settings endpoint). */
export async function setActiveBackend(
  name: StorageBackendName
): Promise<void> {
  await setSetting(ACTIVE_BACKEND_KEY, name);
}

/** True when the given backend has enough config to be selected as active. */
export async function isBackendConfigured(
  name: StorageBackendName
): Promise<boolean> {
  if (name === "gdrive") return isGoogleConfigured();
  if (name === "s3") return isS3ConfiguredAsync();
  if (name === "local") return isLocalConfigured();
  return false;
}

/**
 * Aggregate status for the Settings → File Storage panel: which backend is
 * active, where that choice came from, and per-backend configured/summary info.
 */
export async function getStorageStatus(): Promise<{
  activeBackend: StorageBackendName;
  source: "db" | "env" | "auto";
  backends: {
    gdrive: { configured: boolean };
    s3: Awaited<ReturnType<typeof getS3Status>>;
    local: Awaited<ReturnType<typeof getLocalStatus>>;
  };
}> {
  let source: "db" | "env" | "auto" = "auto";
  let stored: string | null = null;
  try {
    stored = await getSetting(ACTIVE_BACKEND_KEY);
  } catch {
    stored = null;
  }
  if (stored && isValidBackendName(stored.trim().toLowerCase())) source = "db";
  else if (
    isValidBackendName((process.env.STORAGE_BACKEND || "").trim().toLowerCase())
  )
    source = "env";

  const [activeBackend, gdriveConfigured, s3, local] = await Promise.all([
    resolveActiveBackendName(),
    isGoogleConfigured().catch(() => false),
    getS3Status(),
    getLocalStatus(),
  ]);

  return {
    activeBackend,
    source,
    backends: { gdrive: { configured: gdriveConfigured }, s3, local },
  };
}

/** Run a backend's connectivity/writability check for the "Test" button. */
export async function testBackend(
  name: StorageBackendName,
  candidate?: any
): Promise<{ ok: boolean; error?: string }> {
  if (name === "s3") return testS3(candidate);
  if (name === "local") {
    const r = await testLocalWritable(candidate?.dir);
    return { ok: r.ok, error: r.error };
  }
  if (name === "gdrive") {
    // Reuse the Drive heartbeat — it sets the tokenBroken flag as a side effect
    // and never throws. A subsequent status read reflects the result.
    return { ok: await isGoogleConfigured(), error: undefined };
  }
  return { ok: false, error: `Unknown backend: ${name}` };
}

export { s3Backend, gdriveBackend, localBackend };
export { isS3Configured, getS3Status, saveS3Config, testS3 } from "./s3";
export {
  isLocalConfigured,
  getLocalStatus,
  saveLocalDir,
  testLocalWritable,
} from "./local";
export type {
  StorageBackend,
  StorageBackendName,
  UploadMeta,
  DownloadResult,
} from "./types";
export { StorageNotConfiguredError, StorageOperationError } from "./types";
