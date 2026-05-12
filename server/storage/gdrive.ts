import { google, type drive_v3 } from "googleapis";
import { Readable } from "stream";

// OAuth2Client type is re-exported via google.auth.OAuth2 instance.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import type {
  StorageBackend,
  UploadMeta,
  DownloadResult,
} from "./types";
import {
  StorageNotConfiguredError,
  StorageOperationError,
} from "./types";
import { getSetting, setSetting, deleteSetting } from "../db/appSettings";
import { encryptSecret, readMaybeEncrypted } from "../_core/secrets";
import { logger } from "../_core/logger";

/**
 * Sensitive keys whose values must be encrypted-at-rest in `app_settings`.
 * Reads transparently decrypt; writes transparently encrypt. Values written
 * before this hardening landed are read back via `readMaybeEncrypted`, which
 * treats them as plaintext and lets the next write re-encrypt them — no SQL
 * migration needed.
 */
const ENCRYPTED_KEYS = new Set<string>([
  // listed as static keys below; the helpers below ensure these are the only
  // values that go through the envelope.
]);

async function getEncryptedSetting(key: string): Promise<string | null> {
  ENCRYPTED_KEYS.add(key);
  const raw = await getSetting(key);
  if (raw == null) return null;
  try {
    return readMaybeEncrypted(raw);
  } catch (err) {
    logger.error({ key, err: (err as Error).message }, "[gdrive] could not decrypt setting; treating as unset");
    return null;
  }
}

async function setEncryptedSetting(key: string, value: string): Promise<void> {
  ENCRYPTED_KEYS.add(key);
  await setSetting(key, encryptSecret(value));
}

/**
 * Google Drive storage backend.
 *
 * Auth model: app-owner OAuth (NOT a service account). At setup the owner
 * connects their personal Google account via the /api/google-drive/connect
 * flow; the resulting refresh token is persisted in `app_settings`. From then
 * on the server mints short-lived access tokens itself.
 *
 * Folder layout:
 *   <ownerDrive>/HomeVault/uploads/<userId>/<uuid>_<originalName>
 *
 * Folder IDs are cached in `app_settings` (`gdrive.rootFolderId`,
 * `gdrive.userFolder.<userId>`) so we don't list-search Drive on every upload.
 *
 * Download model: stream through the app server (so files stay private — they
 * are NOT shared "anyone with the link"). The route layer pipes the stream
 * to the browser.
 */

export const GDRIVE_KEYS = {
  refreshToken: "gdrive.refreshToken",
  connectedEmail: "gdrive.connectedEmail",
  rootFolderId: "gdrive.rootFolderId",
  userFolderPrefix: "gdrive.userFolder.", // + <userId>
} as const;

export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const ROOT_FOLDER_NAME = "HomeVault";
const USER_FOLDERS_PARENT_NAME = "uploads";

// ─── Env / OAuth client ──────────────────────────────────────────────────────

function readEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
  };
}

export function isGoogleEnvConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = readEnv();
  return !!(clientId && clientSecret && redirectUri);
}

/** Build an OAuth2 client — no refresh token attached yet. Used during the
 * one-time connect flow (auth-URL generation + code exchange). */
export function buildOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = readEnv();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new StorageNotConfiguredError(
      "Google Drive OAuth is not configured. Set GOOGLE_CLIENT_ID, " +
      "GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI in your .env file.",
    );
  }
  return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
}

/** Returns an OAuth2 client pre-loaded with the persisted refresh token.
 * Throws StorageNotConfiguredError if the owner has not yet completed the
 * connect flow in Settings → Integrations. */
async function getAuthedClient(): Promise<OAuth2Client> {
  const client = buildOAuthClient();
  const refreshToken = await getEncryptedSetting(GDRIVE_KEYS.refreshToken);
  if (!refreshToken) {
    throw new StorageNotConfiguredError(
      "Google Drive is not connected. Open Settings → Integrations and click Connect to authorise the app.",
    );
  }
  client.setCredentials({ refresh_token: refreshToken });
  // Keep persisted token in sync if Google ever rotates it.
  client.on("tokens", (tokens: { refresh_token?: string | null }) => {
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      setEncryptedSetting(GDRIVE_KEYS.refreshToken, tokens.refresh_token).catch((err) =>
        logger.error({ err }, "[gdrive] failed to persist rotated refresh token"),
      );
    }
  });
  return client;
}

function getDrive(auth: OAuth2Client): drive_v3.Drive {
  return google.drive({ version: "v3", auth });
}

// ─── Folder management with concurrency-safe caching ─────────────────────────

const _pending: Map<string, Promise<string>> = new Map();

async function ensureFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null,
): Promise<string> {
  // INVARIANT: `name` and `parentId` must ALWAYS come from app-controlled
  // sources — either constant strings declared in this file, a numeric
  // userId coerced via String(), or a Drive-returned fileId from a prior
  // call. NEVER pass user-supplied input here; the Drive query language
  // has no parameterisation, only single-quote escaping below.
  if (
    typeof name !== "string"
    || name.length === 0
    || /[\r\n\0]/.test(name)
    || name.includes("\\")
  ) {
    throw new StorageOperationError("gdrive", "ensureFolder: refusing unsafe folder name");
  }
  if (parentId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(parentId)) {
    throw new StorageOperationError("gdrive", "ensureFolder: refusing unsafe parentId");
  }

  // Lookup by name + parent. trashed=false to ignore deleted folders.
  const q =
    `mimeType='application/vnd.google-apps.folder' ` +
    `and name='${name.replace(/'/g, "\\'")}' ` +
    `and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`);

  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) {
    throw new StorageOperationError("gdrive", "Drive returned no id for created folder");
  }
  return created.data.id;
}

/** Get-or-create + cache helper, keyed by app_settings entry. Folder IDs are
 * encrypted at rest alongside the refresh token — they're not as catastrophic
 * to leak, but they identify the user's Drive layout and there's no reason
 * NOT to wrap them. */
function memoizeFolder(
  cacheKey: string,
  factory: () => Promise<string>,
): Promise<string> {
  const inFlight = _pending.get(cacheKey);
  if (inFlight) return inFlight;

  const p = (async () => {
    const cached = await getEncryptedSetting(cacheKey);
    if (cached) return cached;
    const id = await factory();
    await setEncryptedSetting(cacheKey, id);
    return id;
  })().finally(() => _pending.delete(cacheKey));

  _pending.set(cacheKey, p);
  return p;
}

async function ensureRootFolder(drive: drive_v3.Drive): Promise<string> {
  return memoizeFolder(GDRIVE_KEYS.rootFolderId, () =>
    ensureFolder(drive, ROOT_FOLDER_NAME, null),
  );
}

async function ensureUserFolder(
  drive: drive_v3.Drive,
  ownerUserId: number,
): Promise<string> {
  const root = await ensureRootFolder(drive);
  const uploadsKey = GDRIVE_KEYS.userFolderPrefix + "_uploads";
  const uploadsParent = await memoizeFolder(uploadsKey, () =>
    ensureFolder(drive, USER_FOLDERS_PARENT_NAME, root),
  );
  return memoizeFolder(GDRIVE_KEYS.userFolderPrefix + ownerUserId, () =>
    ensureFolder(drive, String(ownerUserId), uploadsParent),
  );
}

/** Test-only: clear in-process folder caches and any persisted IDs. */
export async function _resetGoogleDriveCachesForTests(): Promise<void> {
  _pending.clear();
  const userKey = GDRIVE_KEYS.userFolderPrefix;
  await Promise.all([
    deleteSetting(GDRIVE_KEYS.rootFolderId),
    deleteSetting(userKey + "_uploads"),
  ]);
}

// ─── Backend implementation ──────────────────────────────────────────────────

function wrapError(action: string, err: unknown): StorageOperationError {
  const msg = (err as Error)?.message ?? String(err);
  return new StorageOperationError("gdrive", `Drive ${action} failed: ${msg}`, err);
}

export const gdriveBackend: StorageBackend = {
  name: "gdrive",

  async upload(buffer: Buffer, meta: UploadMeta) {
    const auth = await getAuthedClient();
    const drive = getDrive(auth);

    let folderId: string;
    try {
      folderId = await ensureUserFolder(drive, meta.ownerUserId);
    } catch (err) {
      throw wrapError("folder lookup", err);
    }

    try {
      const created = await drive.files.create({
        requestBody: {
          name: meta.originalName,
          parents: [folderId],
        },
        media: {
          mimeType: meta.mimeType,
          body: Readable.from(buffer),
        },
        fields: "id",
      });
      const id = created.data.id;
      if (!id) throw new Error("Drive returned an empty file id");
      return { externalId: id };
    } catch (err) {
      throw wrapError("upload", err);
    }
  },

  async download(externalId: string): Promise<DownloadResult> {
    const auth = await getAuthedClient();
    const drive = getDrive(auth);
    try {
      // Fetch metadata first — we want the authoritative mimeType + size so
      // the route layer can set the right Content-Type / Content-Length
      // headers even if the `files` table has a slightly different value
      // (e.g. originalName-derived).
      const meta = await drive.files.get({
        fileId: externalId,
        fields: "id,mimeType,size,trashed",
      });
      if (meta.data.trashed) {
        throw new Error("Drive file is in the trash");
      }
      const mimeType = meta.data.mimeType || "application/octet-stream";
      const size = meta.data.size ? Number(meta.data.size) : undefined;

      const resp = await drive.files.get(
        { fileId: externalId, alt: "media" },
        { responseType: "stream" },
      );
      return {
        kind: "stream",
        stream: resp.data as unknown as NodeJS.ReadableStream,
        mimeType,
        size,
      };
    } catch (err) {
      throw wrapError("download", err);
    }
  },

  async delete(externalId: string): Promise<void> {
    const auth = await getAuthedClient();
    const drive = getDrive(auth);
    try {
      await drive.files.delete({ fileId: externalId });
    } catch (err: any) {
      // 404 on a file we tried to delete is acceptable — somebody already
      // removed it from the Drive UI. Other errors surface to the caller.
      if (err?.code === 404 || err?.response?.status === 404) {
        logger.warn({ externalId }, "[gdrive] delete: file already gone");
        return;
      }
      throw wrapError("delete", err);
    }
  },
};

// ─── OAuth helpers used by the connect/callback route ────────────────────────

export function buildConnectAuthUrl(state?: string): string {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // Force consent so Google returns a NEW refresh_token even if the user has
    // already authorized the app previously. Without this, re-running connect
    // returns access_token only, leaving us without a refresh path.
    prompt: "consent",
    scope: [GDRIVE_SCOPE],
    state,
  });
}

export async function completeConnect(code: string): Promise<{ email: string | null }> {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new StorageOperationError(
      "gdrive",
      "Google did not return a refresh_token. Re-run the connect flow with prompt=consent, or revoke the app at https://myaccount.google.com/permissions and try again.",
    );
  }
  await setEncryptedSetting(GDRIVE_KEYS.refreshToken, tokens.refresh_token);

  // Best-effort: fetch the owner's email so the admin UI can show it.
  let email: string | null = null;
  try {
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? null;
    if (email) await setEncryptedSetting(GDRIVE_KEYS.connectedEmail, email);
  } catch (err) {
    logger.warn({ err }, "[gdrive] could not fetch user email after connect");
  }
  return { email };
}

export async function disconnectGoogleDrive(): Promise<void> {
  await Promise.all([
    deleteSetting(GDRIVE_KEYS.refreshToken),
    deleteSetting(GDRIVE_KEYS.connectedEmail),
    deleteSetting(GDRIVE_KEYS.rootFolderId),
    deleteSetting(GDRIVE_KEYS.userFolderPrefix + "_uploads"),
  ]);
  _pending.clear();
  // Per-user folder cache rows linger harmlessly until next upload.
}

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
}> {
  const [token, email] = await Promise.all([
    getEncryptedSetting(GDRIVE_KEYS.refreshToken),
    getEncryptedSetting(GDRIVE_KEYS.connectedEmail),
  ]);
  return { connected: !!token, email };
}
