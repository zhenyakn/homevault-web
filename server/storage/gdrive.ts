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
  // Legacy per-user-only layout (pre-property folders). Cached so existing
  // installs can still resolve their folder hierarchy without re-listing.
  userFolderPrefix: "gdrive.userFolder.", // + <userId>
  // Per-property layout used by NEW uploads. Folder names in Drive use the
  // form "property-<id>". We never delete the old cache rows — file IDs
  // continue to work regardless of folder location.
  propertyFolderPrefix: "gdrive.propertyFolder.",                 // + <propertyId>
  userPropertyFolderPrefix: "gdrive.userPropertyFolder.",         // + <propertyId>.<userId>
  // Flipped to "1" the moment a Drive call returns invalid_grant. Cleared on
  // a successful re-connect. Lets the status endpoint + Settings UI show
  // "Reconnect needed" instead of silently failing every upload.
  tokenBroken: "gdrive.tokenBroken",
  clientId: "gdrive.clientId",
  clientSecret: "gdrive.clientSecret",
  redirectUri: "gdrive.redirectUri",
} as const;

export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const ROOT_FOLDER_NAME = "HomeVault";
const USER_FOLDERS_PARENT_NAME = "uploads";

// ─── Env / OAuth client ──────────────────────────────────────────────────────

async function readCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fromEnv: boolean;
}> {
  const envId = process.env.GOOGLE_CLIENT_ID || "";
  const envSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const envRedirect = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
  if (envId && envSecret && envRedirect) {
    return { clientId: envId, clientSecret: envSecret, redirectUri: envRedirect, fromEnv: true };
  }
  const [clientId, clientSecret, redirectUri] = await Promise.all([
    getEncryptedSetting(GDRIVE_KEYS.clientId),
    getEncryptedSetting(GDRIVE_KEYS.clientSecret),
    getEncryptedSetting(GDRIVE_KEYS.redirectUri),
  ]);
  return {
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    redirectUri: redirectUri ?? "",
    fromEnv: false,
  };
}

export function isGoogleEnvConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
  return !!(clientId && clientSecret && redirectUri);
}

export async function isGoogleConfigured(): Promise<boolean> {
  const creds = await readCredentials();
  return !!(creds.clientId && creds.clientSecret && creds.redirectUri);
}

/** Build an OAuth2 client — no refresh token attached yet. Used during the
 * one-time connect flow (auth-URL generation + code exchange). */
async function buildOAuthClientAsync(): Promise<OAuth2Client> {
  const { clientId, clientSecret, redirectUri } = await readCredentials();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new StorageNotConfiguredError(
      "Google Drive OAuth is not configured. Open Settings → Integrations to set up your Google OAuth credentials.",
    );
  }
  return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
}

/** Returns an OAuth2 client pre-loaded with the persisted refresh token.
 * Throws StorageNotConfiguredError if the owner has not yet completed the
 * connect flow in Settings → Integrations. */
async function getAuthedClient(): Promise<OAuth2Client> {
  const client = await buildOAuthClientAsync();
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

/**
 * Per-property upload target.
 * Layout: HomeVault/property-<propertyId>/<userId>/
 *
 * Files uploaded BEFORE this layout existed live at the legacy path
 *   HomeVault/uploads/<userId>/<file>
 * and are still reachable by `externalId` (Drive file ID) regardless of path.
 * No migration of existing files.
 */
async function ensureUploadTargetFolder(
  drive: drive_v3.Drive,
  propertyId: number,
  ownerUserId: number,
): Promise<string> {
  const root = await ensureRootFolder(drive);
  const propertyFolder = await memoizeFolder(
    GDRIVE_KEYS.propertyFolderPrefix + propertyId,
    () => ensureFolder(drive, `property-${propertyId}`, root),
  );
  return memoizeFolder(
    `${GDRIVE_KEYS.userPropertyFolderPrefix}${propertyId}.${ownerUserId}`,
    () => ensureFolder(drive, String(ownerUserId), propertyFolder),
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

/**
 * Classify Google's error response. Two cases get special treatment:
 *
 *   - `invalid_grant` / "Token has been expired or revoked" — the refresh
 *     token is no longer usable. We flip the `tokenBroken` flag so the
 *     status endpoint can report `needsReconnect: true`, and re-throw as
 *     `StorageNotConfiguredError` so the upload route surfaces a 503 with
 *     a `RECONNECT_REQUIRED` code.
 *
 *   - `storageQuotaExceeded` — Google account is full. Tagged with a
 *     `DRIVE_QUOTA_EXCEEDED:` prefix so the upload route can surface 507.
 *
 * Everything else flows through `wrapError`.
 */
async function classifyAndThrow(action: string, err: unknown): Promise<never> {
  const msg = (err as Error)?.message ?? String(err);
  const code = (err as any)?.code;
  const reason = (err as any)?.errors?.[0]?.reason
    ?? (err as any)?.response?.data?.error?.errors?.[0]?.reason;
  const responseError = (err as any)?.response?.data?.error;
  const googleErrorCode = typeof responseError === "string"
    ? responseError
    : responseError?.message ?? "";

  // ── invalid_grant — refresh token revoked / expired ────────────────────
  const looksLikeInvalidGrant =
    code === "invalid_grant"
    || /invalid_grant/i.test(msg)
    || /invalid_grant/i.test(googleErrorCode)
    || /Token has been expired or revoked/i.test(msg)
    || /Token has been expired or revoked/i.test(googleErrorCode);
  if (looksLikeInvalidGrant) {
    try {
      await setSetting(GDRIVE_KEYS.tokenBroken, "1");
    } catch (writeErr) {
      logger.warn({ err: (writeErr as Error).message }, "[gdrive] could not persist tokenBroken flag");
    }
    throw new StorageNotConfiguredError(
      "Google Drive needs reconnecting (invalid_grant). Open Settings → Integrations and click Reconnect.",
    );
  }

  // ── storageQuotaExceeded — Drive is full ───────────────────────────────
  const looksLikeQuota =
    reason === "storageQuotaExceeded"
    || /storageQuotaExceeded/i.test(msg)
    || /storage quota.*exceeded/i.test(msg);
  if (looksLikeQuota) {
    throw new StorageOperationError(
      "gdrive",
      `DRIVE_QUOTA_EXCEEDED: ${msg}`,
      err,
    );
  }

  throw wrapError(action, err);
}

export const gdriveBackend: StorageBackend = {
  name: "gdrive",

  async upload(buffer: Buffer, meta: UploadMeta) {
    const auth = await getAuthedClient();
    const drive = getDrive(auth);

    let folderId: string;
    try {
      folderId = await ensureUploadTargetFolder(drive, meta.propertyId, meta.ownerUserId);
    } catch (err) {
      await classifyAndThrow("folder lookup", err);
    }

    try {
      const created = await drive.files.create({
        requestBody: {
          name: meta.originalName,
          parents: [folderId!],
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
      await classifyAndThrow("upload", err);
    }
    // unreachable — classifyAndThrow always throws.
    throw new Error("unreachable");
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
      await classifyAndThrow("download", err);
      throw new Error("unreachable");
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
      await classifyAndThrow("delete", err);
    }
  },
};

// ─── OAuth helpers used by the connect/callback route ────────────────────────

export async function buildConnectAuthUrl(state?: string): Promise<string> {
  const client = await buildOAuthClientAsync();
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
  const client = await buildOAuthClientAsync();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new StorageOperationError(
      "gdrive",
      "Google did not return a refresh_token. Re-run the connect flow with prompt=consent, or revoke the app at https://myaccount.google.com/permissions and try again.",
    );
  }
  await setEncryptedSetting(GDRIVE_KEYS.refreshToken, tokens.refresh_token);
  // A fresh connect means the previous invalid_grant condition (if any) is
  // resolved — clear the flag so the UI stops showing "Reconnect needed".
  await deleteSetting(GDRIVE_KEYS.tokenBroken);

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
    deleteSetting(GDRIVE_KEYS.tokenBroken),
  ]);
  _pending.clear();
  // Per-user / per-property folder cache rows linger harmlessly until next upload.
}

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
  // True only when the persisted refresh token still exists but a recent Drive
  // call returned invalid_grant. UI uses this to show an amber "Reconnect"
  // banner instead of the green "Connected" badge.
  needsReconnect: boolean;
}> {
  const [token, email, broken] = await Promise.all([
    getEncryptedSetting(GDRIVE_KEYS.refreshToken),
    getEncryptedSetting(GDRIVE_KEYS.connectedEmail),
    getSetting(GDRIVE_KEYS.tokenBroken),
  ]);
  return {
    connected: !!token,
    email,
    needsReconnect: !!token && broken === "1",
  };
}

export async function saveGoogleCredentials(opts: {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}): Promise<void> {
  const writes: Promise<void>[] = [
    setEncryptedSetting(GDRIVE_KEYS.clientId, opts.clientId),
    setEncryptedSetting(GDRIVE_KEYS.redirectUri, opts.redirectUri),
  ];
  if (opts.clientSecret) {
    writes.push(setEncryptedSetting(GDRIVE_KEYS.clientSecret, opts.clientSecret));
  }
  await Promise.all(writes);
}

export async function getCredentialsStatus(): Promise<{
  clientId: string | null;
  secretExists: boolean;
  redirectUri: string | null;
  fromEnv: boolean;
}> {
  const creds = await readCredentials();
  return {
    clientId: creds.clientId || null,
    secretExists: !!creds.clientSecret,
    redirectUri: creds.redirectUri || null,
    fromEnv: creds.fromEnv,
  };
}

// ─── Proactive heartbeat ─────────────────────────────────────────────────────

const HEARTBEAT_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _lastHeartbeatAt = 0;
let _heartbeatInFlight: Promise<void> | null = null;

/** Test hook — resets the in-process throttle so consecutive test runs probe
 * Drive each time. NEVER call in production code. */
export function _resetDriveHeartbeatThrottleForTests() {
  _lastHeartbeatAt = 0;
  _heartbeatInFlight = null;
}

/**
 * Active heartbeat: actually talks to Drive (`drive.about.get`) to confirm the
 * refresh token still works. Without this, a revoked token stays invisible
 * until the next user upload — which means the amber "Reconnect needed"
 * banner only ever lights up *after* a failed write.
 *
 *   - Success → clears `tokenBroken` (also handles "user reconnected directly
 *     in their Google account" recovery).
 *   - `invalid_grant` → flows through `classifyAndThrow`, which flips
 *     `tokenBroken=1`. The error is then swallowed (this is best-effort —
 *     the caller already has the value via getConnectionStatus).
 *   - Other failures → logged + swallowed. Transient Drive 5xx shouldn't
 *     register a false reconnect alarm.
 *
 * Throttled to once per 5 minutes per process so admin Settings refreshes
 * don't burn Drive API quota.
 *
 * No-op if no refresh token is stored.
 */
export async function validateDriveConnection(): Promise<void> {
  const now = Date.now();
  if (now - _lastHeartbeatAt < HEARTBEAT_TTL_MS) return;
  if (_heartbeatInFlight) return _heartbeatInFlight;

  _heartbeatInFlight = (async () => {
    try {
      // Cheap auth check — only fetch the user fields we already implicitly
      // have (so no PII / scope upgrade required).
      const auth = await getAuthedClient();
      const drive = getDrive(auth);
      await drive.about.get({ fields: "user" });
      // Token verified. Clear any stale tokenBroken flag from a previous
      // partial outage that has since recovered.
      const flag = await getSetting(GDRIVE_KEYS.tokenBroken);
      if (flag === "1") {
        await deleteSetting(GDRIVE_KEYS.tokenBroken);
      }
    } catch (err: unknown) {
      if (err instanceof StorageNotConfiguredError) {
        // Either the env vars are missing or the refresh token was never
        // stored. Either way nothing to validate — the route already
        // reports `connected: false`.
        return;
      }
      try {
        await classifyAndThrow("heartbeat", err);
      } catch (classified) {
        // classifyAndThrow re-throws. We deliberately swallow here so the
        // status endpoint doesn't 500 on a Drive blip; the tokenBroken flag
        // is the durable signal.
        if (classified instanceof StorageNotConfiguredError) {
          // invalid_grant path — tokenBroken already flipped by classify.
          return;
        }
        logger.warn(
          { err: (classified as Error).message },
          "[gdrive] heartbeat probe failed (non-revocation)",
        );
      }
    } finally {
      _lastHeartbeatAt = Date.now();
      _heartbeatInFlight = null;
    }
  })();

  return _heartbeatInFlight;
}
