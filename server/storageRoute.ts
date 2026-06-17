import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { ENV } from "./_core/env";
import { csrfRequireMiddleware } from "./_core/csrf";
import {
  getStorageStatus,
  setActiveBackend,
  isBackendConfigured,
  testBackend,
  saveS3Config,
  saveLocalDir,
  testLocalWritable,
  type StorageBackendName,
} from "./storage";

/**
 * Storage backend admin endpoints — let an admin choose and configure the
 * active file-storage backend (Google Drive / Local disk / S3-compatible) from
 * Settings → File Storage, without editing `.env` or restarting.
 *
 * Gating mirrors googleDriveRoute.ts: read endpoints need the admin role;
 * mutations additionally require ADMIN_SETUP_TOKEN when NO_AUTH is on (so a LAN
 * client on a Home Assistant add-on can't silently re-point storage), and all
 * mutations are CSRF-protected via the double-submit header.
 */

const SETUP_TOKEN_HEADER = "x-admin-setup-token";
const VALID_BACKENDS: StorageBackendName[] = ["gdrive", "s3", "local"];

const router = Router();

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function requireAdmin(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (ctx.user.globalRole !== "superadmin" && ctx.user.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return null;
  }
  return ctx;
}

async function requireRealAdmin(req: Request, res: Response) {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return null;
  if (!ENV.noAuth) return ctx;

  const required = ENV.adminSetupToken;
  if (!required) {
    res.status(503).json({
      error:
        "ADMIN_SETUP_TOKEN is not set on the server. Refusing to change storage configuration in NO_AUTH mode.",
    });
    return null;
  }
  const supplied =
    (req.headers[SETUP_TOKEN_HEADER] as string | undefined) ||
    (typeof req.query.setup_token === "string" ? req.query.setup_token : "");
  if (!supplied || !timingSafeEqualStr(supplied, required)) {
    res.status(403).json({
      error:
        "Admin setup token required (NO_AUTH mode). Pass it via X-Admin-Setup-Token header or ?setup_token=... query.",
    });
    return null;
  }
  return ctx;
}

function parseBackend(value: unknown): StorageBackendName | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (VALID_BACKENDS as string[]).includes(v)
    ? (v as StorageBackendName)
    : null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/api/storage/status", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  try {
    res.json(await getStorageStatus());
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[storage] status error");
    res.status(500).json({ error: "Failed to read storage status" });
  }
});

router.post("/api/storage/active", csrfRequireMiddleware, async (req, res) => {
  const backend = parseBackend((req.body as any)?.backend);
  if (!backend) {
    res.status(400).json({ error: "Invalid or missing backend" });
    return;
  }
  // Selecting/configuring LOCAL disk only needs the admin role. The extra
  // setup-token gate (requireRealAdmin) exists to stop a NO_AUTH LAN client
  // from *rebinding* storage to an attacker-controlled cloud bucket and
  // harvesting future uploads — a threat that doesn't apply to local disk,
  // where files never leave this server. Switching to S3/Drive stays gated.
  const ctx =
    backend === "local"
      ? await requireAdmin(req, res)
      : await requireRealAdmin(req, res);
  if (!ctx) return;
  try {
    if (!(await isBackendConfigured(backend))) {
      res.status(400).json({
        error: `The '${backend}' backend is not configured yet. Configure it before making it active.`,
      });
      return;
    }
    await setActiveBackend(backend);
    res.json({ ok: true, activeBackend: backend });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[storage] set active error");
    res.status(500).json({ error: "Failed to set active backend" });
  }
});

router.post("/api/storage/s3", csrfRequireMiddleware, async (req, res) => {
  const ctx = await requireRealAdmin(req, res);
  if (!ctx) return;
  const { endpoint, bucket, region, accessKeyId, secretAccessKey } =
    (req.body as any) ?? {};
  if (!endpoint?.trim() || !bucket?.trim() || !accessKeyId?.trim()) {
    res
      .status(400)
      .json({ error: "endpoint, bucket and accessKeyId are required" });
    return;
  }
  try {
    const status = await getStorageStatus();
    if (!status.backends.s3.secretExists && !secretAccessKey?.trim()) {
      res
        .status(400)
        .json({ error: "secretAccessKey is required for initial setup" });
      return;
    }
    await saveS3Config({
      endpoint: endpoint.trim(),
      bucket: bucket.trim(),
      region: region?.trim() || undefined,
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey?.trim() || undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[storage] save s3 error");
    res.status(500).json({ error: "Failed to save S3 configuration" });
  }
});

router.post("/api/storage/local", csrfRequireMiddleware, async (req, res) => {
  // Local-only operation — admin role is sufficient (see /active rationale).
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const dir = (req.body as any)?.dir;
  if (!dir?.trim()) {
    res.status(400).json({ error: "dir is required" });
    return;
  }
  try {
    const test = await testLocalWritable(dir.trim());
    if (!test.ok) {
      res
        .status(400)
        .json({ error: `Directory is not writable: ${test.error}` });
      return;
    }
    await saveLocalDir(dir.trim());
    res.json({ ok: true, dir: test.dir });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[storage] save local error");
    res.status(500).json({ error: "Failed to save local directory" });
  }
});

router.post("/api/storage/test", csrfRequireMiddleware, async (req, res) => {
  const backend = parseBackend((req.body as any)?.backend);
  if (!backend) {
    res.status(400).json({ error: "Invalid or missing backend" });
    return;
  }
  // Testing local writability is safe with the admin role; testing external
  // backends touches their credentials, so keep that behind the setup token.
  const ctx =
    backend === "local"
      ? await requireAdmin(req, res)
      : await requireRealAdmin(req, res);
  if (!ctx) return;
  try {
    const result = await testBackend(backend, req.body);
    res.json(result);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[storage] test error");
    res.status(500).json({ error: "Test failed" });
  }
});

export { router as storageRouter };
