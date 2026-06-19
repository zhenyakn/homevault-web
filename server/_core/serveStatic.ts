import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

// Production static-file serving. Kept in its own module — with NO `vite`
// import — so the bundled production server never pulls Vite (and the whole
// build toolchain) into its runtime dependency graph. The add-on image can
// then ship production dependencies only, which makes it much smaller and
// faster to download/install. The dev-only Vite middleware lives in ./vite
// and is loaded lazily (dynamic import) only when NODE_ENV=development.
export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    logger.error(
      { distPath },
      "Build directory not found — run client build first"
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
