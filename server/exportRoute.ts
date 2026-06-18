import { Router } from "express";
import type { Request, Response } from "express";
import * as archiver from "archiver";
import path from "node:path";
import { Readable } from "stream";
import { and, eq, isNull } from "drizzle-orm";
import { createContext } from "./_core/context";
import { logger } from "./_core/logger";
import { buildContentDisposition } from "./_core/rfc8187";
import { getDb } from "./db/client";
import { files } from "../drizzle/schema";
import { hasCapability } from "./db/entitlements";
import { getBackendByName } from "./storage";
import {
  StorageNotConfiguredError,
  StorageOperationError,
  type StorageBackendName,
} from "./storage/types";

/**
 * GET /api/export/files.zip
 *
 * Streams a ZIP of every non-deleted file owned by the requesting user.
 * Used by Settings → Data → "Download files (ZIP)" so a user who's about
 * to disconnect their Drive can leave with their actual file content (the
 * existing JSON export only contains proxy URLs that go 404 post-disconnect).
 *
 * Layout inside the ZIP:
 *   property-<id>/<originalName>     (modern files with files.propertyId set)
 *   legacy/<originalName>            (pre-migration files with NULL propertyId)
 *
 * Collisions on `originalName` within the same folder get _2, _3, … suffixes.
 *
 * Streaming, owner-scoped, rate-limited via the `/api/export` limiter wired
 * in `server/_core/index.ts`. No CSRF (GET).
 */
// archiver@8 exposes its format classes (ZipArchive, …) as named ESM exports
// and ships no default export; @types/archiver@7 hasn't caught up, so reach
// ZipArchive off the namespace import with an explicit constructor type.
const ZipArchive = (
  archiver as unknown as {
    ZipArchive: new (opts?: archiver.ArchiverOptions) => archiver.Archiver;
  }
).ZipArchive;

const router = Router();

router.get("/api/export/files.zip", async (req: Request, res: Response) => {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (
    ctx.tenantId != null &&
    !(await hasCapability(ctx.tenantId, "data.export"))
  ) {
    res.status(403).json({
      error: "Your plan does not include data export.",
      code: "CAPABILITY_REQUIRED",
      capability: "data.export",
    });
    return;
  }
  const userId = ctx.user.id;

  const db = await getDb();
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerUserId, userId), isNull(files.deletedAt)));

  const today = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    buildContentDisposition(`homevault-files-${today}.zip`)
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const zip = new ZipArchive({ zlib: { level: 6 } });
  let aborted = false;
  zip.on("error", (err: Error) => {
    logger.error({ err: err.message }, "[export] archiver error");
    aborted = true;
    if (!res.headersSent) {
      res.status(500).json({ error: "Export failed" });
    } else {
      res.destroy();
    }
  });
  zip.pipe(res);

  // Track per-folder filename collisions.
  const seenNames = new Map<string, number>();
  const uniqueName = (folder: string, name: string): string => {
    const key = `${folder}/${name}`;
    const n = seenNames.get(key) ?? 0;
    seenNames.set(key, n + 1);
    if (n === 0) return name;
    // foo.pdf → foo_2.pdf, foo_3.pdf, ...
    const dot = name.lastIndexOf(".");
    if (dot === -1) return `${name}_${n + 1}`;
    return `${name.slice(0, dot)}_${n + 1}${name.slice(dot)}`;
  };

  for (const row of rows) {
    if (aborted) break;
    const folder =
      row.propertyId == null ? "legacy" : `property-${row.propertyId}`;
    // Strip any directory component a malicious / clumsy `originalName` may
    // carry (e.g. `../etc/passwd.txt`) so the ZIP layout stays flat under
    // the per-property folder. Defence-in-depth — most extractors reject
    // `..` paths but normalising here means we never depend on that.
    const safeName = path.basename(row.originalName);
    const entryName = `${folder}/${uniqueName(folder, safeName)}`;

    try {
      const backend = getBackendByName(row.backend as StorageBackendName);
      const result = await backend.download(row.externalId);
      if (result.kind === "stream") {
        zip.append(result.stream as Readable, { name: entryName });
        // Wait for this entry to drain before queuing the next, so we don't
        // pile huge streams in memory on slow links.
        await new Promise<void>(resolve => {
          (result.stream as Readable).on("end", resolve);
          (result.stream as Readable).on("error", resolve);
        });
      } else if (result.kind === "redirect") {
        // S3 path — fetch the signed URL bytes ourselves so they end up in
        // the ZIP. (Alternative: an HTTP-level redirect won't fit a ZIP.)
        const resp = await fetch(result.url);
        if (!resp.ok || !resp.body) {
          logger.warn(
            { id: row.id, status: resp.status },
            "[export] skipped (S3 fetch failed)"
          );
          continue;
        }
        // Convert WHATWG ReadableStream → Node Readable so archiver can stream.
        const nodeStream = Readable.fromWeb(resp.body as any);
        zip.append(nodeStream, { name: entryName });
        await new Promise<void>(resolve => {
          nodeStream.on("end", resolve);
          nodeStream.on("error", resolve);
        });
      }
    } catch (err) {
      const isCfg = err instanceof StorageNotConfiguredError;
      const isOp = err instanceof StorageOperationError;
      logger.warn(
        {
          id: row.id,
          kind: isCfg ? "not-configured" : isOp ? "backend" : "unknown",
          err: (err as Error).message,
        },
        "[export] skipped (backend error)"
      );
      // Skip the file; keep the export going. A README inside the ZIP lists
      // skipped entries.
      zip.append(
        Buffer.from(
          `Could not fetch "${row.originalName}" from storage backend.\n`
        ),
        { name: `${folder}/_SKIPPED__${row.id}.txt` }
      );
      continue;
    }
  }

  zip.finalize();
});

export { router as exportRouter };
