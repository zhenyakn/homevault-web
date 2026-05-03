import { Router } from "express";
import multer from "multer";
import type { Request, Response } from "express";
import { createContext } from "./_core/context";
import { ENV } from "./_core/env";
import { uploadPaperlessDocument } from "./paperlessClient";

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
  limits: { fileSize: 64 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not supported by the Paperless connector.`));
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
  return ctx;
}

function paperlessBaseUrl() {
  return ENV.paperlessUrl.replace(/\/$/, "");
}

async function proxyPaperlessBinary(req: Request, res: Response, mode: "preview" | "download") {
  const ctx = await requireUser(req, res);
  if (!ctx) return;

  if (!ENV.paperlessUrl || !ENV.paperlessToken) {
    res.status(503).json({ error: "Paperless is not configured. Set PAPERLESS_URL and PAPERLESS_TOKEN." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid Paperless document id" });
    return;
  }

  const upstream = await fetch(`${paperlessBaseUrl()}/api/documents/${id}/${mode}/`, {
    headers: { Authorization: `Token ${ENV.paperlessToken}` },
  });

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    res.status(upstream.status).send(body || upstream.statusText);
    return;
  }

  const contentType = upstream.headers.get("content-type");
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentType) res.setHeader("content-type", contentType);
  if (contentDisposition) res.setHeader("content-disposition", contentDisposition);

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.send(buffer);
}

router.post("/api/paperless/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (multerErr) => {
    if (multerErr) {
      res.status(400).json({ error: multerErr.message });
      return;
    }

    try {
      const ctx = await requireUser(req, res);
      if (!ctx) return;

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const title = typeof req.body?.title === "string" ? req.body.title : undefined;
      const result = await uploadPaperlessDocument(file, title);
      res.json(result);
    } catch (error: any) {
      console.error("[Paperless] Upload failed:", error);
      res.status(502).json({ error: error?.message ?? "Paperless upload failed" });
    }
  });
});

router.get("/api/paperless/documents/:id/preview", (req, res) => {
  proxyPaperlessBinary(req, res, "preview").catch((error) => {
    console.error("[Paperless] Preview proxy failed:", error);
    res.status(502).json({ error: error?.message ?? "Paperless preview failed" });
  });
});

router.get("/api/paperless/documents/:id/download", (req, res) => {
  proxyPaperlessBinary(req, res, "download").catch((error) => {
    console.error("[Paperless] Download proxy failed:", error);
    res.status(502).json({ error: error?.message ?? "Paperless download failed" });
  });
});

export { router as paperlessRouter };
