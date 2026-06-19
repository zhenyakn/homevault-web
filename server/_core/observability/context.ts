/**
 * Request-scoped observability context, propagated with AsyncLocalStorage.
 *
 * This is the keystone of the whole design: once a request enters
 * `runWithContext`, every log line, span, and metric emitted anywhere down the
 * (sync or async) call stack automatically inherits its correlation ids —
 * trace id, request id, the authenticated user and tenant, the route — with no
 * manual plumbing through function signatures. The logger's pino `mixin` reads
 * from here on every line; the tracer reads from here to parent new spans.
 */

import { AsyncLocalStorage } from "async_hooks";

export interface ObsContext {
  /** Short human-facing handle (req_xxx). */
  requestId: string;
  /** W3C trace id (32 hex). Shared across all spans + logs of the request. */
  traceId: string;
  /** Active span id (16 hex). Updated as spans are entered/exited. */
  spanId: string;
  /** Parent span id, if this request continues an upstream trace. */
  parentSpanId?: string;
  /** Authenticated user id, once auth has resolved it. */
  userId?: number;
  /** Active tenant id — drives per-tenant log access. */
  tenantId?: number;
  /** Logical route, e.g. "POST /api/trpc" or "rpc:property.list". */
  route?: string;
}

const storage = new AsyncLocalStorage<ObsContext>();

/** Run `fn` with `ctx` as the active observability context. */
export function runWithContext<T>(ctx: ObsContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active context, or undefined when running outside a request scope. */
export function getContext(): ObsContext | undefined {
  return storage.getStore();
}

/**
 * Mutate the active context in place. Used to fold in fields that only become
 * known mid-request (the resolved user/tenant after auth, the matched route,
 * the current span id as spans are entered). No-op outside a request scope.
 */
export function updateContext(patch: Partial<ObsContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}

/**
 * The subset of context fields stamped onto every log line / span. Kept small
 * and stable so downstream tooling (the viewer, an OTLP exporter) can rely on
 * it. snake_case mirrors OpenTelemetry log attribute conventions.
 */
export function contextFields(): Record<string, unknown> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  const fields: Record<string, unknown> = {
    request_id: ctx.requestId,
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
  };
  if (ctx.parentSpanId) fields.parent_span_id = ctx.parentSpanId;
  if (ctx.userId != null) fields.user_id = ctx.userId;
  if (ctx.tenantId != null) fields.tenant_id = ctx.tenantId;
  if (ctx.route) fields.route = ctx.route;
  return fields;
}
