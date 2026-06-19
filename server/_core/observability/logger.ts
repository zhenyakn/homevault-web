/**
 * The logging pillar: a pino root logger fanned out to three sinks via
 * pino.multistream —
 *   1. console  (pretty in dev, JSON in prod)
 *   2. rotating file (durable, compressed, retention-pruned) — see fileSink.ts
 *   3. in-memory ring buffer (powers the in-app viewer) — see ringBuffer.ts
 *
 * Every line is auto-stamped with the request-scoped correlation context (trace
 * id, request id, user, tenant, route) by the pino `mixin`, and run through the
 * secret-redaction policy. Namespaced child loggers + runtime level control
 * (global and per-namespace) round it out.
 */

import pino from "pino";
import pretty from "pino-pretty";
import { obsConfig } from "./config";
import { contextFields } from "./context";
import { REDACT_PATHS, REDACT_CENSOR } from "./redact";
import { LogStore, type LogRecord } from "./ringBuffer";
import {
  type LevelSetting,
  type LogLevel,
  isLevelSetting,
  levelFromValue,
} from "./levels";
import { RotatingFileSink } from "./fileSink";

const cfg = obsConfig;

/**
 * Error serializer that preserves the full `cause` chain (Node 16+ Error
 * `cause`), so a wrapped error logs every layer's type/message/stack instead of
 * just the outermost one. Depth-capped to avoid pathological cycles.
 */
function serializeError(err: unknown, depth = 0): unknown {
  if (depth > 5 || !(err instanceof Error)) return err;
  const base = pino.stdSerializers.err(err as Error) as Record<string, unknown>;
  const cause = (err as Error).cause;
  if (cause) base.cause = serializeError(cause, depth + 1);
  // Surface a domain error code if present (TRPCError, HTTP errors, etc.).
  const code = (err as { code?: unknown }).code;
  if (code != null) base.code = code;
  return base;
}

// ── In-memory buffer for the viewer ──────────────────────────────────────────
export const logStore = new LogStore(cfg.bufferSize);
let droppedParseFailures = 0;

const bufferStream = {
  write(line: string): boolean {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      logStore.add(toLogRecord(obj));
    } catch {
      droppedParseFailures++;
    }
    return true;
  },
};

function toLogRecord(o: Record<string, unknown>): Omit<LogRecord, "seq"> {
  const levelNum = typeof o.level === "number" ? o.level : 30;
  const {
    level: _l,
    time: _t,
    msg,
    namespace,
    request_id,
    trace_id,
    span_id,
    user_id,
    tenant_id,
    route,
    pid: _pid,
    hostname: _h,
    service: _s,
    version: _v,
    ...fields
  } = o;
  return {
    time: typeof o.time === "number" ? o.time : Date.now(),
    level: levelFromValue(levelNum),
    msg: typeof msg === "string" ? msg : "",
    namespace: typeof namespace === "string" ? namespace : undefined,
    requestId: typeof request_id === "string" ? request_id : undefined,
    traceId: typeof trace_id === "string" ? trace_id : undefined,
    spanId: typeof span_id === "string" ? span_id : undefined,
    userId: typeof user_id === "number" ? user_id : undefined,
    tenantId: typeof tenant_id === "number" ? tenant_id : undefined,
    route: typeof route === "string" ? route : undefined,
    fields,
  };
}

// ── Rotating file sink ────────────────────────────────────────────────────────
export const fileSink: RotatingFileSink | null = cfg.file.enabled
  ? new RotatingFileSink({
      dir: cfg.file.dir,
      maxSizeBytes: cfg.file.maxSizeBytes,
      maxFiles: cfg.file.maxFiles,
      retentionDays: cfg.file.retentionDays,
      compress: cfg.file.compress,
    })
  : null;

// ── Console sink ──────────────────────────────────────────────────────────────
const consoleStream =
  cfg.logFormat === "pretty"
    ? pretty({
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname,service,version",
        messageFormat: "{namespace} {msg}",
      })
    : process.stdout;

// ── Root logger ───────────────────────────────────────────────────────────────
const streams: pino.StreamEntry[] = [
  { stream: consoleStream as NodeJS.WritableStream },
  { stream: bufferStream as unknown as NodeJS.WritableStream },
];
if (fileSink) {
  streams.push({ stream: fileSink as unknown as NodeJS.WritableStream });
}

const initialLevel: LevelSetting = isLevelSetting(cfg.logLevel)
  ? (cfg.logLevel as LevelSetting)
  : "info";

export const logger: pino.Logger = pino(
  {
    level: initialLevel,
    base: { service: cfg.serviceName, version: cfg.serviceVersion },
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    serializers: { err: serializeError, error: serializeError },
    // Auto-correlation: fold the AsyncLocalStorage context into every line.
    mixin: () => contextFields(),
  },
  pino.multistream(streams)
);

// ── Namespaced child loggers + runtime level control ──────────────────────────
const children = new Map<string, pino.Logger>();
const nsOverrides = new Map<string, LevelSetting>();

/**
 * A namespaced child logger ("db", "auth", "http", "rpc:property", …). Children
 * are memoised so a later `setNamespaceLevel` reaches every call site.
 */
export function createLogger(namespace: string): pino.Logger {
  const existing = children.get(namespace);
  if (existing) return existing;
  const child = logger.child({ namespace });
  child.level = nsOverrides.get(namespace) ?? (logger.level as LevelSetting);
  children.set(namespace, child);
  return child;
}

export function getLevel(): LevelSetting {
  return logger.level as LevelSetting;
}

/** Change the global minimum level at runtime (no restart). */
export function setLevel(level: LevelSetting): void {
  logger.level = level;
  for (const [ns, child] of Array.from(children)) {
    if (!nsOverrides.has(ns)) child.level = level;
  }
}

/** Override (or, with null, clear) the level for a single namespace. */
export function setNamespaceLevel(
  namespace: string,
  level: LevelSetting | null
): void {
  if (level == null) {
    nsOverrides.delete(namespace);
    const child = children.get(namespace);
    if (child) child.level = logger.level as LevelSetting;
    return;
  }
  nsOverrides.set(namespace, level);
  createLogger(namespace).level = level;
}

export function getNamespaceLevels(): Record<string, LevelSetting> {
  return Object.fromEntries(nsOverrides);
}

export function knownNamespaces(): string[] {
  return Array.from(children.keys()).sort();
}

/**
 * Probabilistic keep decision for high-volume, low-value access logs (e.g. a
 * 2xx request line). Errors/warnings should bypass this and always log. Keeps
 * log cost bounded under load without losing signal.
 */
export function shouldSampleAccessLog(): boolean {
  return cfg.sampleRate >= 1 || Math.random() < cfg.sampleRate;
}

export function droppedLogCount(): number {
  return droppedParseFailures;
}

/** Flush the file sink (used before shutdown / on demand). */
export async function flushLogs(): Promise<void> {
  await fileSink?.flush();
}

export async function closeLogs(): Promise<void> {
  await fileSink?.close();
}

export type { LogLevel, LevelSetting };
