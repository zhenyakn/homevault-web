import { Router } from "express";
import multer from "multer";
import { createContext } from "./_core/context";
import { uploadPaperlessDocument } from "./paperlessClient";
import type { Request, Response } from "express";

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Use images, PDFs, or Office documents.`));
    }
  },
});

const router = Router();

router.post("/api/paperless/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      res.status(400).json({ error: multerErr.message });
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

      const result = await uploadPaperlessDocument({
        file,
        title: typeof req.body?.title === "string" ? req.body.title : undefined,
        tags: typeof req.body?.tags === "string" ? req.body.tags : undefined,
      });

      res.json(result);
    } catch (error: any) {
      console.error("[Paperless Upload] Error:", error);
      res.status(502).json({ error: error?.message || "Paperless upload failed" });
    }
  });
});

export { router as paperlessUploadRouter };
