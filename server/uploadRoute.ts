import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createContext } from "./_core/context";
import type { Request, Response } from "express";

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/heic", "image/heif",                          // iPhone photos
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Use images, PDFs, or Office documents.`));
    }
  },
});

const router = Router();

router.post("/api/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      res.status(400).json({ error: multerErr.message });
      return;
    }

    try {
      // Check authentication
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const key = `uploads/${ctx.user.id}/${Date.now()}_${file.originalname}`;

      let url: string;
      try {
        const result = await storagePut(key, file.buffer, file.mimetype);
        url = result.url;
      } catch (storageError: any) {
        const message = storageError?.message ?? "Storage upload failed";
        const isConfig = message.includes("No storage backend configured") ||
                         message.includes("STORAGE_ENDPOINT") ||
                         message.includes("BUILT_IN_FORGE");
        console.error("[Upload] Storage error:", message);
        res.status(503).json({
          error: isConfig
            ? "File storage is not configured. Set STORAGE_ENDPOINT (Cloudflare R2) or BUILT_IN_FORGE_API_URL in your .env file."
            : "File upload failed. Please try again.",
        });
        return;
      }

      res.json({
        url,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });
});

export { router as uploadRouter };
