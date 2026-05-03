import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import { createContext } from "./_core/context";
import {
  fetchPaperlessDocumentFile,
  getPaperlessHttpStatus,
  isPaperlessNotConfigured,
  uploadPaperlessDocument,
} from "./paperlessClient";

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
  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Use images, PDFs, Office documents, or text files.`));
    }
  },
});

const router = Router();

async function requireUser(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return ctx.user;
}

router.post("/api/paperless/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      res.status(400).json({ error: multerErr.message });
      return;
    }

    try {
      const user = await requireUser(req, res);
      if (!user) return;

      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const result = await uploadPaperlessDocument({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        title: typeof req.body?.title === "string" ? req.body.title : undefined,
      });

      res.json({ ok: true, result });
    } catch (error: any) {
      const status = isPaperlessNotConfigured(error) ? 503 : getPaperlessHttpStatus(error);
      console.error("[Paperless Upload] Error:", error?.message ?? error);
      res.status(status).json({ error: error?.message ?? "Paperless upload failed" });
    }
  });
});

router.get("/api/paperless/documents/:id/download", async (req: Request, res: Response) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: "Invalid document id" });
      return;
    }

    const paperlessResponse = await fetchPaperlessDocumentFile(documentId);
    const contentType = paperlessResponse.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = paperlessResponse.headers.get("content-disposition");

    res.setHeader("Content-Type", contentType);
    if (contentDisposition) {
      res.setHeader("Content-Disposition", contentDisposition);
    }

    const arrayBuffer = await paperlessResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    const status = isPaperlessNotConfigured(error) ? 503 : getPaperlessHttpStatus(error);
    console.error("[Paperless Download] Error:", error?.message ?? error);
    res.status(status).json({ error: error?.message ?? "Paperless download failed" });
  }
});

export { router as paperlessUploadRouter };
