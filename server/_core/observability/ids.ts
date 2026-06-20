/**
 * ID generation + W3C Trace Context (traceparent) parsing/formatting.
 *
 * Implemented in-house (crypto only, no OpenTelemetry SDK) so trace propagation
 * works today and stays compatible with any OTel collector you point it at
 * later: trace ids are 16 bytes / span ids are 8 bytes of hex, exactly as the
 * spec requires, and traceparent uses the `00-<trace>-<span>-<flags>` form.
 */

import { randomBytes } from "crypto";

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

/** 32-hex-char (128-bit) trace id, per W3C Trace Context. */
export function generateTraceId(): string {
  return randomBytes(TRACE_ID_BYTES).toString("hex");
}

/** 16-hex-char (64-bit) span id, per W3C Trace Context. */
export function generateSpanId(): string {
  return randomBytes(SPAN_ID_BYTES).toString("hex");
}

/**
 * Short, human-friendly request id for log scanning / support ("req_ab12cd34").
 * Distinct from trace id: it's the handle a human pastes into the viewer.
 */
export function generateRequestId(): string {
  return `req_${randomBytes(5).toString("hex")}`;
}

const ZERO_TRACE = "0".repeat(TRACE_ID_BYTES * 2);
const ZERO_SPAN = "0".repeat(SPAN_ID_BYTES * 2);
const TRACEPARENT_RX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export interface ParsedTraceparent {
  traceId: string;
  parentSpanId: string;
  sampled: boolean;
}

/**
 * Parse an incoming `traceparent` header. Returns null for anything malformed
 * or for the all-zero (invalid) trace/span ids, so a forged header can't pin
 * every request onto one bogus trace.
 */
export function parseTraceparent(
  header: string | string[] | undefined
): ParsedTraceparent | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const m = value.trim().toLowerCase().match(TRACEPARENT_RX);
  if (!m) return null;
  const [, traceId, parentSpanId, flags] = m;
  if (traceId === ZERO_TRACE || parentSpanId === ZERO_SPAN) return null;
  return {
    traceId,
    parentSpanId,
    sampled: (parseInt(flags, 16) & 0x01) === 0x01,
  };
}

/** Build a `traceparent` header value for downstream propagation. */
export function formatTraceparent(
  traceId: string,
  spanId: string,
  sampled = true
): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}
