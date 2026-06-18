import { createReadStream } from "fs";
import { mkdir, writeFile, stat, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { StorageBackend, UploadMeta, DownloadResult } from "./types";
import { StorageNotConfiguredError, StorageOperationError } from "./types";
import { getSetting, setSetting } from "../db/appSettings";

/**
 * Local-filesystem storage backend.
 *
 * The zero-configuration option: files are written under a single base
 * directory on the server (a Docker volume or the Home Assistant add-on's
 * persistent `/data` dir). No accounts, no OAuth, no cloud credentials — which
 * is exactly why it's the easiest backend to stand up on a self-hosted install.
 *
 * Layout (mirrors the S3 key scheme):
 *   <baseDir>/<ownerUserId>/<timestamp>_<rand>_<safeName>
 *
 * Download model: stream the file back through the app server (like Drive), so
 * `filesRoute.ts` keeps enforcing owner-scoping + the hardened attachment
 * headers. The route forces `Content-Type: application/octet-stream`, so the
 * mimeType we return here is informational — only `size` is used (Content-Length).
 */

// Base dir precedence: app_settings (`storage.local.dir`) → env STORAGE_DIR →
// default. `/data/uploads` is a natural Docker mount target and lives under the
// Home Assistant add-on's persistent `/data` directory.
const DEFAULT_BASE_DIR = "/data/uploads";
export const LOCAL_DIR_KEY = "storage.local.dir";

function envBaseDir(): string {
  return (process.env.STORAGE_DIR || "").trim();
}

/** Resolve the absolute base directory, consulting the DB override first. */
async function resolveBaseDir(): Promise<string> {
  let dir = "";
  try {
    dir = (await getSetting(LOCAL_DIR_KEY))?.trim() || "";
  } catch {
    // No DB / not reachable — fall back to env/default. Local storage must keep
    // working even when app_settings can't be read.
    dir = "";
  }
  if (!dir) dir = envBaseDir();
  if (!dir) dir = DEFAULT_BASE_DIR;
  return path.resolve(dir);
}

/**
 * Resolve a stored `externalId` (relative key) to an absolute path, guarding
 * against path traversal. `externalId` is always produced by our own
 * `buildKey`, so this is defence-in-depth against a corrupted/malicious row.
 */
function resolveSafe(baseDir: string, externalId: string): string {
  if (externalId.includes("\0")) {
    throw new StorageOperationError("local", "invalid file key");
  }
  const abs = path.resolve(baseDir, externalId);
  if (abs !== baseDir && !abs.startsWith(baseDir + path.sep)) {
    throw new StorageOperationError("local", "file key escapes storage dir");
  }
  return abs;
}

function buildKey(
  ownerUserId: number,
  originalName: string,
  tenantId?: number | null
): string {
  // 8-char random suffix prevents collisions when the same name is uploaded
  // twice (matches the S3 backend's buildKey).
  const hash = crypto.randomBytes(4).toString("hex");
  const safe = originalName.replace(/[^\w.\-]+/g, "_");
  const lastDot = safe.lastIndexOf(".");
  const stamped =
    lastDot === -1
      ? `${safe}_${hash}`
      : `${safe.slice(0, lastDot)}_${hash}${safe.slice(lastDot)}`;
  // Per-tenant isolation prefix for new uploads. Existing objects keep their
  // un-prefixed key (resolved via the stored externalId), so no re-keying.
  const prefix = tenantId != null ? `tenant/${tenantId}/` : "";
  return `${prefix}${ownerUserId}/${Date.now()}_${stamped}`;
}

/**
 * Local storage is "configured" whenever a base dir resolves — it has no
 * external dependencies, which is the whole point. We additionally verify the
 * directory is creatable/writable so the Settings UI can show a real status.
 */
export async function isLocalConfigured(): Promise<boolean> {
  try {
    const baseDir = await resolveBaseDir();
    await mkdir(baseDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Status summary for the Settings UI (never throws). */
export async function getLocalStatus(): Promise<{
  configured: boolean;
  dir: string;
  fromEnv: boolean;
  writable: boolean;
}> {
  const baseDir = await resolveBaseDir();
  let fromEnv = false;
  try {
    const dbDir = (await getSetting(LOCAL_DIR_KEY))?.trim() || "";
    fromEnv = !dbDir && !!envBaseDir();
  } catch {
    fromEnv = !!envBaseDir();
  }
  const writable = await isLocalConfigured();
  return { configured: writable, dir: baseDir, fromEnv, writable };
}

/** Persist the local storage directory (used by the admin Settings endpoint). */
export async function saveLocalDir(dir: string): Promise<void> {
  await setSetting(LOCAL_DIR_KEY, dir.trim());
}

/**
 * Test that the configured (or candidate) directory is writable: create it,
 * write a tiny probe file, then remove it. Returns a structured result so the
 * UI can show a clear pass/fail without throwing.
 */
export async function testLocalWritable(
  candidateDir?: string
): Promise<{ ok: boolean; dir: string; error?: string }> {
  const baseDir = candidateDir?.trim()
    ? path.resolve(candidateDir.trim())
    : await resolveBaseDir();
  const probe = path.join(baseDir, `.homevault-write-test-${Date.now()}`);
  try {
    await mkdir(baseDir, { recursive: true });
    await writeFile(probe, "ok");
    await unlink(probe).catch(() => {});
    return { ok: true, dir: baseDir };
  } catch (err) {
    return { ok: false, dir: baseDir, error: (err as Error).message };
  }
}

export const localBackend: StorageBackend = {
  name: "local",

  async upload(buffer: Buffer, meta: UploadMeta) {
    const baseDir = await resolveBaseDir();
    const key = buildKey(meta.ownerUserId, meta.originalName, meta.tenantId);
    const abs = resolveSafe(baseDir, key);
    try {
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, buffer);
      return { externalId: key };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EACCES" || e.code === "EPERM" || e.code === "ENOENT") {
        throw new StorageNotConfiguredError(
          `Local storage directory '${baseDir}' is not writable (${e.code}). ` +
            "Set STORAGE_DIR (or the directory in Settings → File Storage) to a " +
            "writable, persistent path."
        );
      }
      throw new StorageOperationError(
        "local",
        `Local write failed: ${(err as Error).message}`,
        err
      );
    }
  },

  async download(externalId: string): Promise<DownloadResult> {
    const baseDir = await resolveBaseDir();
    const abs = resolveSafe(baseDir, externalId);
    try {
      const info = await stat(abs);
      return {
        kind: "stream",
        // Route forces octet-stream; mimeType here is informational only.
        stream: createReadStream(abs),
        mimeType: "application/octet-stream",
        size: info.size,
      };
    } catch (err) {
      throw new StorageOperationError(
        "local",
        `Local read failed: ${(err as Error).message}`,
        err
      );
    }
  },

  async delete(externalId: string): Promise<void> {
    const baseDir = await resolveBaseDir();
    const abs = resolveSafe(baseDir, externalId);
    try {
      await unlink(abs);
    } catch (err) {
      // Idempotent — a missing file is already in the desired state. Required by
      // reapOrphanedFiles / deleteFileForOwner (matches gdrive 404 / S3).
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new StorageOperationError(
        "local",
        `Local delete failed: ${(err as Error).message}`,
        err
      );
    }
  },
};
