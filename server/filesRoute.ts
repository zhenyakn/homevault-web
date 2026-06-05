import { Router } from "express";
import type { Request, Response } from "express";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { csrfRequireMiddleware } from "./_core/csrf";
import { buildContentDisposition } from "./_core/rfc8187";
import { deleteFileForOwner, getFileForOwner } from "./files";
import { getBackendByName } from "./storage";
import {
  StorageNotConfiguredError,
  StorageOperationError,
  type StorageBackendName,
} from "./storage/types";

/**
 * GET    /api/files/:id              — proxy download (forced attachment)
 * GET    /api/files/:id/:name        — same route, the trailing name is
 *                                     decorative (browser shows it as the
 *                                     suggested filename via Content-Disposition).
 * DELETE /api/files/:id              — explicit removal; tRPC update flows
 *                                     usually delete via syncAttachmentRemovals.
 *
 * Hardening choices:
 *   - Always `Content-Disposition: attachment` so the browser saves to disk
 *     instead of trying to render the body. This neutralises the stored-XSS
 *     risk of uploaded HTML/SVG payloads.
 *   - Always `Content-Type: application/octet-stream` — we do NOT echo the
 *     stored mimeType. The browser cannot sniff its way to executing the
 *     file as a script.
 *   - `X-Content-Type-Options: nosniff` + a tight CSP belt-and-braces the
 *     above against legacy / quirky browsers.
 *   - `Cross-Origin-Resource-Policy: same-origin` prevents `<img src>` /
 *     `<script src>` from other origins.
 *   - Always owner-scoped: a logged-in user can only access their own files.
 *     Non-owners get 404 (NOT 403) to prevent fileId enumeration.
 */

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; sandbox; frame-ancestors 'none'; base-uri 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
};

function applySecurityHeaders(res: Response) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

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

  // Apply hardened headers BEFORE the backend call so the browser sees them
  // even on a 502/503 error mid-flight.
  applySecurityHeaders(res);

  try {
    const backend = getBackendByName(row.backend as StorageBackendName);
    const result = await backend.download(row.externalId);

    if (result.kind === "redirect") {
      res.set("Cache-Control", "no-store");
      // Note: the redirect target (S3 signed URL) controls its own response
      // headers — we cannot enforce attachment-mode there. Keep S3 buckets'
      // bucket-level policies in mind: turn off "browsable" listings.
      res.redirect(302, result.url);
      return;
    }

    // Stream path — used for Drive (and any future backend that streams). We
    // deliberately ignore both `row.mimeType` and `result.mimeType` and force
    // octet-stream so the browser never tries to render the body. The
    // filename is the only place where row metadata leaks back to the client.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(row.originalName, "attachment")
    );
    if (result.size) res.setHeader("Content-Length", String(result.size));
    res.setHeader("Cache-Control", "private, no-store");

    result.stream.on("error", err => {
      logger.error({ err: err.message, id: row.id }, "[files] stream error");
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
      logger.error(
        { backend: err.backend, err: err.message },
        "[files] backend error"
      );
      res.status(502).json({ error: "Backend returned an error" });
      return;
    }
    logger.error({ err: (err as Error).message }, "[files] unknown error");
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/api/files/:id", csrfRequireMiddleware, async (req, res) => {
  const loaded = await loadOwnedFile(req, res);
  if (!loaded) return;
  const { row, userId } = loaded;

  const result = await deleteFileForOwner(row.id, userId);
  res.json({
    deleted: result.deleted,
    backendError: result.backendError ?? null,
  });
});

export { router as filesRouter };
