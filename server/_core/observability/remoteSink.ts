/**
 * Reserved remote-export seam (the "pluggable later" decision).
 *
 * We do not ship telemetry off-box today. What lives here is the contract +
 * data mapping so turning on OTLP/Loki/Datadog export later is a wiring step,
 * not a rearchitecture: `toOtlpLogRecord` maps our internal LogRecord onto the
 * OpenTelemetry logs data model, and `RemoteSink` is the interface an exporter
 * would implement. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set we log a single
 * notice that export is configured-but-not-yet-enabled, rather than silently
 * doing nothing.
 */

import { SEVERITY_NUMBER } from "./levels";
import type { LogRecord } from "./ringBuffer";
import type { SpanData } from "./tracer";

export interface RemoteSink {
  exportLogs(records: LogRecord[]): Promise<void>;
  exportSpans(spans: SpanData[]): Promise<void>;
  shutdown(): Promise<void>;
}

/** Map an internal log record onto an OTLP-shaped log record. */
export function toOtlpLogRecord(
  r: LogRecord,
  resource: { serviceName: string; serviceVersion: string }
): Record<string, unknown> {
  return {
    timeUnixNano: r.time * 1_000_000,
    severityNumber: SEVERITY_NUMBER[r.level],
    severityText: r.level.toUpperCase(),
    body: { stringValue: r.msg },
    traceId: r.traceId,
    spanId: r.spanId,
    resource: {
      attributes: {
        "service.name": resource.serviceName,
        "service.version": resource.serviceVersion,
      },
    },
    attributes: {
      "log.namespace": r.namespace,
      "request.id": r.requestId,
      "user.id": r.userId,
      "tenant.id": r.tenantId,
      route: r.route,
      ...r.fields,
    },
  };
}

let noticed = false;

/**
 * Resolve the configured remote sink. Returns null today (export disabled), but
 * emits a one-time notice when an endpoint is configured so operators aren't
 * surprised that nothing is shipping yet.
 */
export function resolveRemoteSink(
  otlpEndpoint: string,
  notify: (msg: string) => void
): RemoteSink | null {
  if (otlpEndpoint && !noticed) {
    noticed = true;
    notify(
      `OTEL_EXPORTER_OTLP_ENDPOINT is set (${otlpEndpoint}) but remote export ` +
        `is reserved and not yet enabled in this build — telemetry stays local.`
    );
  }
  return null;
}
