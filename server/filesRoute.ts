import { Router } from "express";
import type { Request, Response } from "express";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import {
  deleteFileForOwner,
  getFileForOwner,
} from "./files";
import { getBackendByName } from "./storage";
import {
  StorageNotConfiguredError,
  StorageOperationError,
  type StorageBackendName,
} from "./storage/types";

/**
 * GET    /api/files/:id              — proxy download
 * GET    /api/files/:id/:name        — same; the trailing name keeps the
 *                                     existing FileUpload preview UI happy
 *                                     (url.split("/").pop() → filename).
 * DELETE /api/files/:id              — explicit removal; tRPC update flows
 *                                     usually delete via syncAttachmentRemovals.
 *
 * Always owner-scoped: a logged-in user can only access their own files.
 * Non-owners get 404 (NOT 403) to prevent fileId enumeration.
 */

const router = Router();

async function loadOwnedFile(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const id = (req.params as any).id as string | undefined;
  if (!id) {
    res.status(400).json({ error: "Missing file id" });
    return null;
  }
  const row = await getFileForOwner(id, ctx.user.id);
  if (!row) {
    res.status(404).json({ error: "File not found" });
    return null;
  }
  return { row, userId: ctx.user.id };
}

router.get(["/api/files/:id", "/api/files/:id/:name"], async (req, res) => {
  const loaded = await loadOwnedFile(req, res);
  if (!loaded) return;
  const { row } = loaded;

  try {
    const backend = getBackendByName(row.backend as StorageBackendName);
    const result = await backend.download(row.externalId);

    if (result.kind === "redirect") {
      res.set("Cache-Control", "no-store");
      res.redirect(302, result.url);
      return;
    }

    // Stream — used for Drive (private files proxied through the app server)
    res.setHeader("Content-Type", row.mimeType || result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(row.originalName)}"`,
    );
    if (result.size) res.setHeader("Content-Length", String(result.size));
    res.setHeader("Cache-Control", "private, max-age=300");

    result.stream.on("error", (err) => {
      logger.error({ err: err.message, id: row.id }, "[files] stream error");
      // If headers were already sent we can only abort; otherwise reply 502.
      if (res.headersSent) {
        res.destroy();
      } else {
        res.status(502).json({ error: "Failed to fetch file from backend" });
      }
    });
    result.stream.pipe(res);
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof StorageOperationError) {
      logger.error({ backend: err.backend, err: err.message }, "[files] backend error");
      res.status(502).json({ error: "Backend returned an error" });
      return;
    }
    logger.error({ err: (err as Error).message }, "[files] unknown error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/api/files/:id", async (req, res) => {
  const loaded = await loadOwnedFile(req, res);
  if (!loaded) return;
  const { row, userId } = loaded;

  const result = await deleteFileForOwner(row.id, userId);
  res.json({ deleted: result.deleted, backendError: result.backendError ?? null });
});

export { router as filesRouter };
