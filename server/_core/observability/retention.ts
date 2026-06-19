/**
 * Retention enforcement (compliance). Rotation already prunes on every roll,
 * but a low-traffic instance may rotate rarely, so we also run a daily sweep
 * that drops rotated log files past the age window. Reuses node-cron, matching
 * the reminder scheduler's pattern.
 */

import cron from "node-cron";
import { obsConfig } from "./config";
import { fileSink } from "./logger";
import { createLogger } from "./logger";

const log = createLogger("observability");
let started = false;

/** Schedule the daily retention sweep (02:30 server time). Safe to call once. */
export function startRetentionSweep(): void {
  if (started) return;
  if (process.env.NODE_ENV === "test") return;
  if (!fileSink || obsConfig.file.retentionDays <= 0) return;
  started = true;
  cron.schedule("30 2 * * *", () => {
    void pruneNow();
  });
  log.info(
    { retentionDays: obsConfig.file.retentionDays },
    "log retention sweep scheduled (02:30 daily)"
  );
}

/** Run the age-based prune immediately. */
export async function pruneNow(): Promise<void> {
  if (!fileSink) return;
  try {
    await fileSink.pruneByAge();
    log.debug("log retention sweep complete");
  } catch (err) {
    log.warn({ err }, "log retention sweep failed");
  }
}
