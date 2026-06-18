import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { csrfRequireMiddleware } from "./_core/csrf";
import { uploadAndRegister } from "./files";
import { hasCapability } from "./db/entitlements";
import {
  StorageNotConfiguredError,
  StorageOperationError,
} from "./storage/types";
import type { Request, Response } from "express";

/**
 * POST /api/upload
 *
 * Receives a single multipart `file`, validates it (browser MIME against the
 * allowlist, magic-byte MIME against the same allowlist), hands it to the
 * active storage backend (Google Drive or S3), inserts a row in `files`,
 * and returns the proxy URL that the frontend should persist in attachment
 * lists.
 *
 * Hardening choices:
 *   - CSRF double-submit token required (production / dev — skipped in test).
 *   - Two MIME checks: the browser-supplied header, then the file's actual
 *     magic bytes. Both must be in the allowlist. This rejects forged
 *     Content-Type uploads (e.g. an HTML payload claiming `image/png`).
 *   - In-process concurrency semaphore — at most N simultaneous active
 *     uploads to bound peak memory (multer uses memory storage).
 *   - The sniffed MIME (not the browser's) is persisted to the `files` row,
 *     so subsequent renders/diagnostics use the authoritative value.
 *
 * Response shape (unchanged for the existing FileUpload.tsx consumer):
 *   { url, filename, mimeType, size, id }
 */

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_FILE_BYTES = 16 * 1024 * 1024; // 16 MB
const MAX_CONCURRENT_UPLOADS = 3;

// ─── Concurrency semaphore ────────────────────────────────────────────────────

let _active = 0;
const _waiters: Array<() => void> = [];

function acquireSlot(): Promise<() => void> {
  return new Promise(resolve => {
    const grant = () => {
      _active++;
      resolve(() => {
        _active--;
        const next = _waiters.shift();
        if (next) next();
      });
    };
    if (_active < MAX_CONCURRENT_UPLOADS) grant();
    else _waiters.push(grant);
  });
}

// ─── Multer setup (browser-MIME prefilter only — magic-bytes happens later) ──

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type '${file.mimetype}' is not allowed. Use images, PDFs, or Office documents.`
        )
      );
    }
  },
});

const router = Router();

// ─── Authoritative MIME sniffing ─────────────────────────────────────────────

/**
 * Returns the authoritative MIME type for a buffer:
 *   - For binary types (images, PDF, Office docs) we use `file-type` magic-byte
 *     detection. If the sniff fails or returns a mime that isn't allowlisted,
 *     the upload is rejected.
 *
 * Magic-byte detection rejects the entire class of "HTML payload pretending
 * to be image/png" tricks the browser MIME header allowed.
 */
async function sniffAndValidate(
  buffer: Buffer,
  browserMime: string
): Promise<{
  mimeType: string;
  rejected?: string;
}> {
  const sniff = await fileTypeFromBuffer(buffer);
  if (!sniff) {
    return {
      mimeType: browserMime,
      rejected:
        "File contents do not match any recognised type. Only images, PDFs, and Office documents are accepted.",
    };
  }
  if (!ALLOWED_MIMETYPES.has(sniff.mime)) {
    return {
      mimeType: sniff.mime,
      rejected: `File contents are '${sniff.mime}' which is not on the allowlist.`,
    };
  }
  // Belt-and-braces: if the browser said "image/png" but the bytes say
  // "image/jpeg", trust the bytes (and log).
  if (sniff.mime !== browserMime) {
    logger.warn(
      { browserMime, sniffMime: sniff.mime },
      "[Upload] sniffed MIME does not match browser MIME — using sniffed value"
    );
  }
  return { mimeType: sniff.mime };
}

router.post(
  "/api/upload",
  csrfRequireMiddleware,
  (req: Request, res: Response) => {
    upload.single("file")(req, res, async multerErr => {
      if (multerErr) {
        const status = multerErr.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        res.status(status).json({ error: multerErr.message });
        return;
      }

      const release = await acquireSlot();
      try {
        const ctx = await createContext({ req, res } as any);
        if (!ctx.user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        // Feature gating: file uploads may be a paid capability (SAAS). In
        // standalone everything is included, so this is a no-op there.
        if (
          ctx.tenantId != null &&
          !(await hasCapability(ctx.tenantId, "files.upload"))
        ) {
          res.status(403).json({
            error: "Your plan does not include file uploads.",
            code: "CAPABILITY_REQUIRED",
            capability: "files.upload",
          });
          return;
        }

        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          res.status(413).json({ error: "File exceeds 16MB limit" });
          return;
        }

        const sniff = await sniffAndValidate(file.buffer, file.mimetype);
        if (sniff.rejected) {
          res.status(415).json({ error: sniff.rejected });
          return;
        }

        try {
          const { record, url } = await uploadAndRegister({
            buffer: file.buffer,
            originalName: file.originalname,
            // Persist the AUTHORITATIVE mime type, not the browser's.
            mimeType: sniff.mimeType,
            ownerUserId: ctx.user.id,
            propertyId: ctx.propertyId,
            tenantId: ctx.tenantId,
          });
          res.json({
            id: record.id,
            url,
            filename: record.originalName,
            mimeType: record.mimeType,
            size: record.size,
          });
        } catch (storageError) {
          if (storageError instanceof StorageNotConfiguredError) {
            // "Drive needs reconnecting" is communicated as a structured code so
            // the frontend can branch to a specific UI (link to Settings) rather
            // than showing a generic "Upload failed" toast.
            const reconnect =
              /reconnect|invalid_grant|expired or revoked/i.test(
                storageError.message
              );
            logger.warn(
              { message: storageError.message, reconnect },
              "[Upload] not configured"
            );
            res.status(503).json({
              error: storageError.message,
              code: reconnect ? "RECONNECT_REQUIRED" : "STORAGE_NOT_CONFIGURED",
            });
            return;
          }
          if (storageError instanceof StorageOperationError) {
            // Drive quota exhaustion: surface 507 + a code the UI can render.
            const quota =
              /DRIVE_QUOTA_EXCEEDED|storageQuotaExceeded|storage quota/i.test(
                storageError.message
              );
            logger.error(
              {
                backend: storageError.backend,
                message: storageError.message,
                quota,
              },
              "[Upload] storage error"
            );
            if (quota) {
              res.status(507).json({
                error:
                  "Your Google Drive is full. Free up space or upgrade your plan.",
                code: "DRIVE_QUOTA_EXCEEDED",
              });
              return;
            }
            res
              .status(502)
              .json({ error: "File upload failed — see server logs." });
            return;
          }
          logger.error(
            { err: (storageError as Error).message },
            "[Upload] unknown error"
          );
          res
            .status(500)
            .json({ error: "File upload failed. Please try again." });
        }
      } catch (error) {
        logger.error(
          { err: (error as Error).message },
          "[Upload] handler error"
        );
        res
          .status(500)
          .json({ error: (error as Error).message || "Upload failed" });
      } finally {
        release();
      }
    });
  }
);

export { router as uploadRouter };

// ─── Test hooks ──────────────────────────────────────────────────────────────

export function _currentActiveUploadsForTests(): number {
  return _active;
}
