/**
 * Process-level failure capture. Without these, an uncaught exception or an
 * unhandled promise rejection vanishes (or prints a bare stack to stderr) with
 * no correlation, no file record, and no flush. Here they become structured,
 * buffered, file-persisted fatal/error logs.
 *
 * Policy:
 *  - uncaughtException: log fatal, flush sinks, exit(1). Continuing after one
 *    leaves the process in an undefined state; let the supervisor restart it.
 *  - unhandledRejection: log error but keep running (less certainly fatal).
 *  - warning: log at warn (deprecations, max-listeners, etc.).
 */

import { createLogger, flushLogs } from "./logger";

let installed = false;

export function installProcessHandlers(): void {
  if (installed) return;
  installed = true;
  const log = createLogger("process");

  process.on("uncaughtException", (err: Error) => {
    log.fatal({ err }, "uncaught exception — shutting down");
    void flushLogs().finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason: unknown) => {
    log.error({ err: reason }, "unhandled promise rejection");
  });

  process.on("warning", (warning: Error) => {
    log.warn(
      { name: warning.name, message: warning.message, stack: warning.stack },
      "node process warning"
    );
  });
}
