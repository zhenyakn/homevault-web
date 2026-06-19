/**
 * Observability barrel — the public surface of the logging / tracing / metrics
 * stack. Import from here (`@/server/_core/observability`) rather than reaching
 * into individual files.
 */

import { flushLogs, closeLogs, createLogger } from "./logger";

// Levels & types
export {
  LEVELS,
  type LogLevel,
  type LevelSetting,
  LEVEL_VALUES,
  SEVERITY_NUMBER,
  isLevel,
  isLevelSetting,
  levelFromValue,
  meetsThreshold,
} from "./levels";

// Context propagation
export {
  runWithContext,
  getContext,
  updateContext,
  contextFields,
  type ObsContext,
} from "./context";

// IDs / trace context
export {
  generateTraceId,
  generateSpanId,
  generateRequestId,
  parseTraceparent,
  formatTraceparent,
  type ParsedTraceparent,
} from "./ids";

// Logging
export {
  logger,
  createLogger,
  logStore,
  fileSink,
  getLevel,
  setLevel,
  setNamespaceLevel,
  getNamespaceLevels,
  knownNamespaces,
  shouldSampleAccessLog,
  droppedLogCount,
  flushLogs,
  closeLogs,
} from "./logger";

// Log buffer query types
export {
  type LogRecord,
  type LogQuery,
  RingBuffer,
  LogStore,
} from "./ringBuffer";

// File listing
export { listLogFiles, type LogFileInfo } from "./fileSink";

// Tracing
export {
  startSpan,
  withSpan,
  getTrace,
  recentTraces,
  type ActiveSpan,
  type SpanData,
  type SpanKind,
  type SpanStatus,
  type TraceSummary,
} from "./tracer";

// Metrics
export {
  recordRequest,
  metricsSummary,
  renderPrometheus,
  type MetricsSummary,
  type RecordRequestArgs,
} from "./metrics";

// Remote export seam
export { toOtlpLogRecord, type RemoteSink } from "./remoteSink";

// Retention
export { startRetentionSweep, pruneNow } from "./retention";

/**
 * Flush + close all sinks. Call on graceful shutdown so no buffered log line is
 * lost when the process exits.
 */
export async function shutdownObservability(): Promise<void> {
  const log = createLogger("observability");
  log.info("flushing telemetry sinks before shutdown");
  await flushLogs();
  await closeLogs();
}
