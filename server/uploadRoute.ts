import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createContext } from "./_core/context";
import type { Request, Response } from "express";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB
});

const router = Router();

router.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
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

    const ext = file.originalname.split(".").pop() || "bin";
    const key = `uploads/${ctx.user.id}/${Date.now()}_${file.originalname}`;

    const { url } = await storagePut(key, file.buffer, file.mimetype);

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

export { router as uploadRouter };
