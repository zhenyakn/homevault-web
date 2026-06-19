/**
 * The tracing pillar: a minimal, OpenTelemetry-shaped in-process tracer.
 *
 * No OTel SDK dependency — spans are plain records (trace/span/parent ids,
 * name, kind, timing, attributes, status, events) kept in a ring buffer and
 * grouped by trace id, which is exactly what the viewer needs to render
 * "request id → full correlated trace". The shape maps 1:1 onto OTLP spans, so
 * the reserved remote exporter can ship them unchanged later.
 */

import { obsConfig } from "./config";
import {
  getContext,
  updateContext,
  runWithContext,
  type ObsContext,
} from "./context";
import { generateSpanId } from "./ids";
import { RingBuffer } from "./ringBuffer";

export type SpanKind = "server" | "client" | "internal";
export type SpanStatus = "unset" | "ok" | "error";

export interface SpanEvent {
  time: number;
  name: string;
  attributes?: Record<string, unknown>;
}

export interface SpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: SpanStatus;
  statusMessage?: string;
}

export interface ActiveSpan {
  readonly data: SpanData;
  setAttribute(key: string, value: unknown): void;
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: SpanStatus, message?: string): void;
  end(): void;
}

const cfg = obsConfig;
const buffer = new RingBuffer<SpanData>(cfg.trace.bufferSize);

function record(span: SpanData): void {
  buffer.push(span);
}

class NoopSpan implements ActiveSpan {
  readonly data: SpanData;
  constructor(data: SpanData) {
    this.data = data;
  }
  setAttribute(): void {}
  setAttributes(): void {}
  addEvent(): void {}
  setStatus(): void {}
  end(): void {}
}

class RealSpan implements ActiveSpan {
  ended = false;
  constructor(
    public readonly data: SpanData,
    private readonly restoreSpanId: string
  ) {}

  setAttribute(key: string, value: unknown): void {
    this.data.attributes[key] = value;
  }
  setAttributes(attrs: Record<string, unknown>): void {
    Object.assign(this.data.attributes, attrs);
  }
  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.data.events.push({ time: Date.now(), name, attributes });
  }
  setStatus(status: SpanStatus, message?: string): void {
    this.data.status = status;
    if (message) this.data.statusMessage = message;
  }
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.data.endTime = Date.now();
    this.data.durationMs = this.data.endTime - this.data.startTime;
    record(this.data);
    // Pop back to the parent span id in the active context.
    updateContext({ spanId: this.restoreSpanId });
  }
}

export interface StartSpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, unknown>;
}

/**
 * Start a span as a child of the current context's active span. The new span id
 * becomes the active one until `end()`. Returns a no-op span when tracing is
 * disabled or there is no request context.
 */
export function startSpan(name: string, opts: StartSpanOptions = {}): ActiveSpan {
  const ctx = getContext();
  if (!cfg.trace.enabled || !ctx) {
    return new NoopSpan({
      traceId: ctx?.traceId ?? "0".repeat(32),
      spanId: "0".repeat(16),
      name,
      kind: opts.kind ?? "internal",
      startTime: Date.now(),
      attributes: opts.attributes ?? {},
      events: [],
      status: "unset",
    });
  }
  const parentSpanId = ctx.spanId;
  const spanId = generateSpanId();
  const data: SpanData = {
    traceId: ctx.traceId,
    spanId,
    parentSpanId,
    name,
    kind: opts.kind ?? "internal",
    startTime: Date.now(),
    attributes: { ...opts.attributes },
    events: [],
    status: "unset",
  };
  updateContext({ spanId });
  return new RealSpan(data, parentSpanId);
}

/**
 * Start the request's root span, reusing the trace/span ids already placed on
 * the active context (so the HTTP layer controls id generation + propagation).
 * Unlike `startSpan` it does not allocate a new span id or reparent.
 */
export function startRootSpan(
  name: string,
  opts: StartSpanOptions = {}
): ActiveSpan {
  const ctx = getContext();
  if (!cfg.trace.enabled || !ctx) {
    return new NoopSpan({
      traceId: ctx?.traceId ?? "0".repeat(32),
      spanId: ctx?.spanId ?? "0".repeat(16),
      name,
      kind: opts.kind ?? "server",
      startTime: Date.now(),
      attributes: opts.attributes ?? {},
      events: [],
      status: "unset",
    });
  }
  const data: SpanData = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    name,
    kind: opts.kind ?? "server",
    startTime: Date.now(),
    attributes: { ...opts.attributes },
    events: [],
    status: "unset",
  };
  // restoreSpanId = its own id: ending the root is a no-op for context.
  return new RealSpan(data, ctx.spanId);
}

/**
 * Run `fn` inside a span, ending it automatically and recording an error status
 * (plus re-throwing) if it throws.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: ActiveSpan) => Promise<T> | T,
  opts: StartSpanOptions = {}
): Promise<T> {
  const span = startSpan(name, opts);
  try {
    const result = await fn(span);
    if (span.data.status === "unset") span.setStatus("ok");
    return result;
  } catch (err) {
    span.setStatus("error", err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    span.end();
  }
}

/** All buffered spans for a trace, ordered by start time. */
export function getTrace(traceId: string): SpanData[] {
  return buffer
    .toArray()
    .filter(s => s.traceId === traceId)
    .sort((a, b) => a.startTime - b.startTime);
}

export interface TraceSummary {
  traceId: string;
  rootName: string;
  startTime: number;
  durationMs: number;
  spanCount: number;
  status: SpanStatus;
  requestId?: string;
  route?: string;
  tenantId?: number;
  userId?: number;
}

/** Recent traces (one row per trace id), newest first — for the Traces tab. */
export function recentTraces(limit = 100): TraceSummary[] {
  const byTrace = new Map<string, SpanData[]>();
  for (const s of buffer.toArray()) {
    const arr = byTrace.get(s.traceId) ?? [];
    arr.push(s);
    byTrace.set(s.traceId, arr);
  }
  const summaries: TraceSummary[] = [];
  for (const [traceId, spans] of Array.from(byTrace)) {
    spans.sort((a, b) => a.startTime - b.startTime);
    const root = spans.find(s => !s.parentSpanId) ?? spans[0];
    const start = Math.min(...spans.map(s => s.startTime));
    const end = Math.max(...spans.map(s => s.endTime ?? s.startTime));
    summaries.push({
      traceId,
      rootName: root.name,
      startTime: start,
      durationMs: end - start,
      spanCount: spans.length,
      status: spans.some(s => s.status === "error") ? "error" : "ok",
      requestId:
        typeof root.attributes["request_id"] === "string"
          ? (root.attributes["request_id"] as string)
          : undefined,
      route:
        typeof root.attributes["route"] === "string"
          ? (root.attributes["route"] as string)
          : undefined,
      tenantId:
        typeof root.attributes["tenant_id"] === "number"
          ? (root.attributes["tenant_id"] as number)
          : undefined,
      userId:
        typeof root.attributes["user_id"] === "number"
          ? (root.attributes["user_id"] as number)
          : undefined,
    });
  }
  return summaries
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, limit);
}

/** Re-export so callers can open a fresh root context + run within it. */
export { runWithContext };
export type { ObsContext };
