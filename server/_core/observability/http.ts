/**
 * HTTP instrumentation middleware — the entry point that opens an observability
 * context for every request.
 *
 * For each non-skipped request it: ingests/continues the W3C trace, mints a
 * request id, opens a root server span, and runs the rest of the pipeline
 * inside that AsyncLocalStorage context so every downstream log/span/metric
 * auto-correlates. On response finish it records RED metrics, ends the span,
 * and emits a single access-log line (sampled for successful low-value calls,
 * never for errors). Correlation ids are echoed back as response headers.
 */

import type { Request, Response, NextFunction } from "express";
import { performance } from "perf_hooks";
import { runWithContext, type ObsContext } from "./context";
import {
  generateRequestId,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
} from "./ids";
import { startRootSpan } from "./tracer";
import { createLogger, shouldSampleAccessLog } from "./logger";
import { recordRequest } from "./metrics";

const log = createLogger("http");

// Paths that are too noisy / not interesting to trace: health probes, the Vite
// dev pipeline, and hashed static assets. They still serve normally — we just
// don't open a span or log a line for each one.
const SKIP_EXACT = new Set(["/health", "/favicon.ico"]);
const SKIP_PREFIXES = [
  "/@vite",
  "/@react-refresh",
  "/@fs",
  "/@id",
  "/src/",
  "/node_modules/",
  "/assets/",
  "/__vite",
  "/.vite",
];

function shouldSkip(path: string): boolean {
  if (SKIP_EXACT.has(path)) return true;
  return SKIP_PREFIXES.some(p => path.startsWith(p));
}

export function httpObservabilityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (shouldSkip(req.path)) {
    next();
    return;
  }

  const incoming = parseTraceparent(req.headers["traceparent"]);
  const traceId = incoming?.traceId ?? generateTraceId();
  const spanId = generateSpanId();
  const requestId = generateRequestId();
  const route = `${req.method} ${req.path}`;

  const ctx: ObsContext = {
    requestId,
    traceId,
    spanId,
    parentSpanId: incoming?.parentSpanId,
    route,
  };

  runWithContext(ctx, () => {
    const start = performance.now();
    const span = startRootSpan(route, {
      kind: "server",
      attributes: {
        "http.method": req.method,
        "http.route": req.path,
        "http.target": req.originalUrl,
        request_id: requestId,
        route,
      },
    });

    // Echo correlation back so clients / proxies can stitch traces + support
    // can map a user-reported request id to logs.
    res.setHeader("x-request-id", requestId);
    res.setHeader("traceparent", formatTraceparent(traceId, spanId));

    let finished = false;
    const onDone = () => {
      if (finished) return;
      finished = true;
      const durationMs = performance.now() - start;
      const status = res.statusCode;
      const errored = status >= 500;

      span.setAttributes({
        "http.status_code": status,
        "http.duration_ms": Math.round(durationMs),
      });
      span.setStatus(errored ? "error" : "ok");
      span.end();

      recordRequest({
        transport: "http",
        route: req.path,
        method: req.method,
        statusCode: status,
        durationMs,
        errored,
      });

      const fields = {
        method: req.method,
        path: req.path,
        status,
        duration_ms: Math.round(durationMs),
        ip: req.ip,
        length: res.getHeader("content-length"),
      };
      if (status >= 500) {
        log.error(fields, "http request failed");
      } else if (status >= 400) {
        log.warn(fields, "http request");
      } else if (shouldSampleAccessLog()) {
        log.info(fields, "http request");
      }
    };

    res.on("finish", onDone);
    res.on("close", onDone);
    next();
  });
}
