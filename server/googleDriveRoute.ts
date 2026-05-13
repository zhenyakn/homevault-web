import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { ENV } from "./_core/env";
import { csrfRequireMiddleware } from "./_core/csrf";
import {
  buildConnectAuthUrl,
  completeConnect,
  disconnectGoogleDrive,
  getConnectionStatus,
  isGoogleEnvConfigured,
  validateDriveConnection,
} from "./storage/gdrive";
import { StorageNotConfiguredError, StorageOperationError } from "./storage/types";

/**
 * Google Drive setup endpoints.
 *
 * Flow:
 *   1. Admin opens Settings → Integrations.
 *   2. Clicks "Connect" → GET /api/google-drive/connect generates a CSRF state,
 *      stores its hash in a short-lived HttpOnly cookie, and redirects to
 *      Google's consent screen with the drive.file scope.
 *   3. Google redirects back to /api/google-drive/callback?code=...&state=...
 *   4. Server verifies the state matches the cookie (timing-safe), exchanges
 *      the code for a refresh_token, stores it (encrypted) in app_settings,
 *      then bounces the browser to /settings/integrations with a one-shot flag.
 *   5. "Disconnect" → POST /api/google-drive/disconnect (CSRF-protected via
 *      the double-submit header) clears the refresh token + cached folder IDs.
 *
 * GET /api/google-drive/status returns { configured, connected, emailMasked }
 * so the frontend can render the correct UI without exposing the raw token
 * or full email to logs / casual screenshots.
 */

const OAUTH_STATE_COOKIE = "gdrive_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SETUP_TOKEN_HEADER = "x-admin-setup-token";

// One-shot params land in window.location.search (NOT inside the hash) so the
// existing hash-based router still routes to /settings/integrations while the
// Settings page reads the flag from `?gdrive=...`.
const CONNECTED_REDIRECT = "/?gdrive=connected#/settings/integrations";
const errorRedirect = (msg: string) =>
  `/?gdrive=error&message=${encodeURIComponent(msg)}#/settings/integrations`;
// Generic message shown to the user — verbose Google text stays in server logs.
const GENERIC_CALLBACK_ERROR = "Could not complete the Google connection. Try again.";

const router = Router();

// ─── Auth + admin gating ─────────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (ctx.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return null;
  }
  return ctx;
}

/**
 * Stronger gate for the connect/callback/disconnect endpoints. When NO_AUTH is
 * on (Home Assistant add-on default), every request is auto-admin-ed by the
 * session middleware — that's fine for read endpoints, but an attacker on the
 * local network could otherwise re-bind the homeowner's Drive to their own
 * Google account or silently disconnect it. Requiring a setup token here makes
 * the threat model explicit: only someone with the env-configured shared secret
 * may rebind storage.
 *
 * When NO_AUTH is off (normal cookie auth), the admin role check is enough.
 */
async function requireRealAdmin(req: Request, res: Response) {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return null;
  if (!ENV.noAuth) return ctx;

  const required = ENV.adminSetupToken;
  if (!required) {
    res.status(503).json({
      error:
        "ADMIN_SETUP_TOKEN is not set on the server. Refusing to mutate Drive credentials in NO_AUTH mode.",
    });
    return null;
  }
  const supplied = (req.headers[SETUP_TOKEN_HEADER] as string | undefined)
    || (typeof req.query.setup_token === "string" ? req.query.setup_token : "");
  if (!supplied || !timingSafeEqualStr(supplied, required)) {
    res.status(403).json({
      error:
        "Admin setup token required (NO_AUTH mode). Pass it via X-Admin-Setup-Token header or ?setup_token=... query.",
    });
    return null;
  }
  return ctx;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// ─── OAuth state CSRF helpers ────────────────────────────────────────────────

function hashState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("base64url");
}

function buildStateCookieOptions(req: Request) {
  const xfp = req.headers["x-forwarded-proto"];
  const proto = typeof xfp === "string" ? xfp.split(",")[0].trim() : req.protocol;
  const secure = ENV.isProduction || proto === "https";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS,
  };
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/api/google-drive/status", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    // Proactive heartbeat: when an admin loads Settings → Integrations we
    // probe Drive at most once every 5 minutes (in-process throttled). The
    // result is a side-effect on the `tokenBroken` flag in app_settings,
    // which `getConnectionStatus` below reads to compute `needsReconnect`.
    // Errors are swallowed inside `validateDriveConnection` — we never want
    // the status endpoint itself to 500 on a Drive blip.
    await validateDriveConnection();
    const status = await getConnectionStatus();
    res.json({
      configured: isGoogleEnvConfigured(),
      connected: status.connected,
      // True when a Drive call recently returned invalid_grant — the UI uses
      // this to show "Reconnect needed" prominently.
      needsReconnect: status.needsReconnect,
      emailMasked: maskEmail(status.email),
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[gdrive] status error");
    res.status(500).json({ error: "Failed to read status" });
  }
});

router.get("/api/google-drive/connect", async (req, res) => {
  const ctx = await requireRealAdmin(req, res);
  if (!ctx) return;
  try {
    // 256 bits of state — random + opaque. We keep the raw value in the URL we
    // send to Google and store ONLY its hash in our HttpOnly cookie. On callback
    // we hash the returned state and compare in constant time.
    const state = crypto.randomBytes(32).toString("base64url");
    res.cookie(OAUTH_STATE_COOKIE, hashState(state), buildStateCookieOptions(req));
    const url = buildConnectAuthUrl(state);
    res.redirect(302, url);
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      res.status(503).send(err.message);
      return;
    }
    logger.error({ err: (err as Error).message }, "[gdrive] connect error");
    res.status(500).send("Failed to build Google authorization URL");
  }
});

router.get("/api/google-drive/callback", async (req, res) => {
  const code = (req.query.code as string) || "";
  const state = (req.query.state as string) || "";
  const errParam = (req.query.error as string) || "";

  // Snapshot the state cookie value upfront, then immediately clear it so
  // a state can never be replayed across requests. Calling clearCookie
  // *after* res.status / res.redirect would crash (ERR_HTTP_HEADERS_SENT).
  const cookieStateHash = readCookie(req, OAUTH_STATE_COOKIE);
  res.clearCookie(OAUTH_STATE_COOKIE, { ...buildStateCookieOptions(req), maxAge: 0 });

  if (errParam) {
    logger.warn({ err: errParam }, "[gdrive] Google returned an error parameter");
    res.redirect(302, errorRedirect(GENERIC_CALLBACK_ERROR));
    return;
  }
  if (!code) {
    res.status(400).send("Missing authorization code");
    return;
  }

  // Admin AND setup-token gate also applies to the callback — prevents an
  // attacker who somehow captured a code from injecting it via a victim's
  // browser. Combined with the state-cookie binding, two independent secrets
  // (HomeVault admin cookie + state cookie) must match.
  const ctx = await requireRealAdmin(req, res);
  if (!ctx) return;

  // OAuth state CSRF check — the heart of fix C1.
  if (!cookieStateHash || !state) {
    res.status(400).send("Missing or expired OAuth state");
    return;
  }
  let givenHash: string;
  try {
    givenHash = hashState(state);
  } catch {
    res.status(400).send("Invalid OAuth state");
    return;
  }
  if (!timingSafeEqualStr(cookieStateHash, givenHash)) {
    logger.warn("[gdrive] OAuth state mismatch — rejected callback");
    res.status(400).send("OAuth state mismatch");
    return;
  }

  // State verified — exchange the code.
  try {
    const { email } = await completeConnect(code);
    if (email) {
      res.redirect(
        302,
        `/?gdrive=connected&email=${encodeURIComponent(email)}#/settings/integrations`,
      );
    } else {
      res.redirect(302, CONNECTED_REDIRECT);
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[gdrive] callback exchange error");
    res.redirect(302, errorRedirect(GENERIC_CALLBACK_ERROR));
  }
});

router.post(
  "/api/google-drive/disconnect",
  csrfRequireMiddleware,
  async (req, res) => {
    const ctx = await requireRealAdmin(req, res);
    if (!ctx) return;
    try {
      await disconnectGoogleDrive();
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: (err as Error).message }, "[gdrive] disconnect error");
      res.status(500).json({ error: "Failed to disconnect" });
    }
  },
);

export { router as googleDriveRouter };

// ─── Email masking — M5 / L2 ─────────────────────────────────────────────────

/**
 * "owner@example.com" → "o***@example.com"
 * "ab@example.com"    → "**@example.com"
 *
 * Visible enough to confirm the right account, opaque enough to limit leakage
 * via screenshots / shared admin sessions / logs.
 */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${"*".repeat(local.length)}${domain}`;
  return `${local[0]}***${domain}`;
}
