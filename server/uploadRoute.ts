import { Router } from "express";
import multer from "multer";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { uploadAndRegister } from "./files";
import { StorageNotConfiguredError, StorageOperationError } from "./storage/types";
import type { Request, Response } from "express";

/**
 * POST /api/upload
 *
 * Receives a single multipart `file`, validates it, hands it to the active
 * storage backend (Google Drive or S3), inserts a row in `files`, and
 * returns the proxy URL that the frontend should persist in attachment lists.
 *
 * Response shape (unchanged for the existing FileUpload.tsx consumer):
 *   { url, filename, mimeType, size, id }
 *
 *  - `url` is /api/files/<id>/<encoded-name>
 *  - `id` is the new `files` row id (also embedded in `url`)
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type '${file.mimetype}' is not allowed. Use images, PDFs, or Office documents.`,
        ),
      );
    }
  },
});

const router = Router();

router.post("/api/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      const status = multerErr.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({ error: multerErr.message });
      return;
    }

    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      // multer already rejects too-large files via LIMIT_FILE_SIZE, but be
      // defensive in case the limit ever drifts.
      if (file.size > MAX_FILE_BYTES) {
        res.status(413).json({ error: "File exceeds 16MB limit" });
        return;
      }

      try {
        const { record, url } = await uploadAndRegister({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          ownerUserId: ctx.user.id,
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
          logger.warn({ message: storageError.message }, "[Upload] not configured");
          res.status(503).json({ error: storageError.message });
          return;
        }
        if (storageError instanceof StorageOperationError) {
          logger.error({ backend: storageError.backend, message: storageError.message }, "[Upload] storage error");
          res.status(502).json({ error: "File upload failed — see server logs." });
          return;
        }
        logger.error({ err: (storageError as Error).message }, "[Upload] unknown error");
        res.status(500).json({ error: "File upload failed. Please try again." });
      }
    } catch (error) {
      logger.error({ err: (error as Error).message }, "[Upload] handler error");
      res.status(500).json({ error: (error as Error).message || "Upload failed" });
    }
  });
});

export { router as uploadRouter };
