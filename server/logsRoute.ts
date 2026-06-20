/**
 * GET /api/admin/logs/download?file=<name>
 *
 * Streams a single rotating log file to a super-admin for offline analysis /
 * archival. Super-admin-session gated (same createContext auth as the other
 * Express routes), and the requested name is validated against the actual file
 * listing so it can't be used for path traversal — only files the listing
 * reports are downloadable.
 */

import { Router, type Request, type Response } from "express";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createContext } from "./_core/context";
import { buildContentDisposition } from "./_core/rfc8187";
import { obsConfig } from "./_core/observability/config";
import { listLogFiles } from "./_core/observability";
import { createLogger } from "./_core/logger";

const log = createLogger("logs-download");
const router = Router();

router.get("/api/admin/logs/download", async (req: Request, res: Response) => {
  const ctx = await createContext({ req, res } as never);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (ctx.user.globalRole !== "superadmin") {
    res.status(403).json({ error: "Super-admin only" });
    return;
  }
  if (!obsConfig.file.enabled) {
    res.status(404).json({ error: "File logging is disabled" });
    return;
  }

  const requested = String(req.query.file ?? "");
  // Only names the listing actually reports are valid — defeats traversal.
  const allowed = listLogFiles(obsConfig.file.dir).some(
    f => f.name === requested
  );
  if (!allowed) {
    res.status(404).json({ error: "Log file not found" });
    return;
  }

  const fullPath = path.join(obsConfig.file.dir, requested);
  log.info({ file: requested, actor: ctx.user.id }, "log file download");

  res.setHeader(
    "Content-Type",
    requested.endsWith(".gz") ? "application/gzip" : "text/plain; charset=utf-8"
  );
  res.setHeader("Content-Disposition", buildContentDisposition(requested));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const stream = createReadStream(fullPath);
  stream.on("error", err => {
    log.warn(
      { err: err.message, file: requested },
      "log download stream error"
    );
    if (!res.headersSent) res.status(500).json({ error: "Download failed" });
    else res.destroy();
  });
  stream.pipe(res);
});

export { router as logsRouter };
