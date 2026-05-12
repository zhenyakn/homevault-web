import { Router } from "express";
import type { Request, Response } from "express";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import {
  buildConnectAuthUrl,
  completeConnect,
  disconnectGoogleDrive,
  getConnectionStatus,
  isGoogleEnvConfigured,
} from "./storage/gdrive";
import { StorageNotConfiguredError, StorageOperationError } from "./storage/types";

/**
 * Google Drive setup endpoints.
 *
 * Flow:
 *   1. Admin visits Settings → Integrations (frontend page).
 *   2. Clicks "Connect" → GET /api/google-drive/connect issues a redirect to
 *      Google's consent screen with the drive.file scope.
 *   3. Google redirects back to /api/google-drive/callback?code=...
 *   4. Server exchanges the code for a refresh_token, stores it in
 *      app_settings, then redirects the browser back to the Settings page
 *      with a one-shot ?gdrive=connected query param.
 *   5. Admin can later click "Disconnect" → POST /api/google-drive/disconnect
 *      which clears the refresh token + cached folder IDs.
 *
 * GET /api/google-drive/status returns { connected, email, configured } so the
 * frontend can render the correct UI without exposing the refresh token.
 */

// One-shot params are placed in window.location.search (NOT inside the hash)
// so the existing hash-based router can route to /settings/integrations while
// the Settings page reads the flag from `?gdrive=...`.
const CONNECTED_REDIRECT = "/?gdrive=connected#/settings/integrations";
const errorRedirect = (msg: string) =>
  `/?gdrive=error&message=${encodeURIComponent(msg)}#/settings/integrations`;

const router = Router();

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

router.get("/api/google-drive/status", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    const status = await getConnectionStatus();
    res.json({
      configured: isGoogleEnvConfigured(),
      ...status,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[gdrive] status error");
    res.status(500).json({ error: "Failed to read status" });
  }
});

router.get("/api/google-drive/connect", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    const url = buildConnectAuthUrl();
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
  const errParam = (req.query.error as string) || "";
  if (errParam) {
    // The user denied consent or Google returned an error.
    res.redirect(302, errorRedirect(errParam));
    return;
  }
  if (!code) {
    res.status(400).send("Missing authorization code");
    return;
  }

  // Require admin for the callback too — prevents a malicious link from
  // overwriting the refresh token if someone tricks an admin into clicking
  // it from outside the flow.
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

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
    const msg =
      err instanceof StorageOperationError || err instanceof StorageNotConfiguredError
        ? err.message
        : "Failed to complete Google Drive connection";
    logger.error({ err: (err as Error).message }, "[gdrive] callback error");
    res.redirect(302, errorRedirect(msg));
  }
});

router.post("/api/google-drive/disconnect", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    await disconnectGoogleDrive();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[gdrive] disconnect error");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

export { router as googleDriveRouter };
