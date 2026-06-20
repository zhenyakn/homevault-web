/**
 * Backwards-compatible entry point. The logger now lives in the observability
 * module (`./observability`), which wires pino to the console + rotating files
 * + in-memory viewer buffer and auto-stamps the request-correlation context.
 *
 * Existing call sites keep importing `{ logger }` from here unchanged; new code
 * should prefer `createLogger("<namespace>")` for a namespaced child logger.
 */

export { logger, createLogger } from "./observability/logger";
