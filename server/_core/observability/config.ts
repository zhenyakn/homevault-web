/**
 * Observability configuration, parsed directly from process.env.
 *
 * Deliberately self-contained (not derived from `_core/env`): the logging stack
 * is the most foundational thing in the process and must never fail to load,
 * even when `ENV` is partially stubbed (as several unit tests do). Every field
 * has a safe default; `_core/env` re-exports this as `ENV.observability` and
 * also declares the vars in its zod schema for validation + documentation.
 */

export type ObsConfig = {
  serviceName: string;
  serviceVersion: string;
  logLevel: string;
  logFormat: "json" | "pretty";
  file: {
    enabled: boolean;
    dir: string;
    maxSizeBytes: number;
    maxFiles: number;
    retentionDays: number;
    compress: boolean;
  };
  bufferSize: number;
  sampleRate: number;
  trace: { enabled: boolean; bufferSize: number };
  metrics: { enabled: boolean; endpointEnabled: boolean };
  otlpEndpoint: string;
};

/** Parse a human size like "10MB", "512kb", "1048576" into bytes. */
export function parseSize(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? "b").toLowerCase();
  const mult =
    unit === "gb"
      ? 1024 ** 3
      : unit === "mb"
        ? 1024 ** 2
        : unit === "kb"
          ? 1024
          : 1;
  return Math.max(1, Math.floor(n * mult));
}

function intOr(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatOr(raw: string | undefined, fallback: number): number {
  const n = parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function buildConfig(env: NodeJS.ProcessEnv): ObsConfig {
  const isTest = env.NODE_ENV === "test";
  const isProd = env.NODE_ENV === "production";
  const logLevel =
    env.LOG_LEVEL || (isTest ? "silent" : isProd ? "info" : "debug");
  const logFormat =
    (env.LOG_FORMAT as "json" | "pretty" | undefined) ||
    (isProd ? "json" : "pretty");
  return {
    serviceName: env.SERVICE_NAME || "homevault",
    serviceVersion: env.SERVICE_VERSION || "1.0.0",
    logLevel,
    logFormat: logFormat === "json" ? "json" : "pretty",
    file: {
      enabled: env.LOG_FILE_ENABLED !== "false" && !isTest,
      dir: env.LOG_DIR || "logs",
      maxSizeBytes: parseSize(env.LOG_MAX_FILE_SIZE, 10 * 1024 * 1024),
      maxFiles: Math.max(1, intOr(env.LOG_MAX_FILES, 10)),
      retentionDays: Math.max(0, intOr(env.LOG_RETENTION_DAYS, 30)),
      compress: env.LOG_COMPRESS !== "false",
    },
    bufferSize: Math.max(1, intOr(env.LOG_BUFFER_SIZE, 2000)),
    sampleRate: Math.min(1, Math.max(0, floatOr(env.LOG_SAMPLE_RATE, 1))),
    trace: {
      enabled: env.TRACE_ENABLED !== "false",
      bufferSize: Math.max(1, intOr(env.TRACE_BUFFER_SIZE, 500)),
    },
    metrics: {
      enabled: env.METRICS_ENABLED !== "false",
      endpointEnabled: env.METRICS_ENDPOINT_ENABLED === "true",
    },
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
  };
}

export const obsConfig: ObsConfig = buildConfig(process.env);

/** Exposed for unit tests that want to parse a synthetic environment. */
export { buildConfig };
