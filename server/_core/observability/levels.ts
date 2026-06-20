/**
 * Log levels — the single source of truth shared by the logger, the in-memory
 * buffer, the viewer, and the OTLP-export mapper. We keep pino's native numeric
 * scale (so pino-pretty and every pino tool keeps working) and map it to the
 * OpenTelemetry severity numbers at the edges (file/remote export, viewer).
 */

export const LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;

export type LogLevel = (typeof LEVELS)[number];

/** "silent" disables emission entirely; it isn't a record level. */
export type LevelSetting = LogLevel | "silent";

/** pino's numeric level values. */
export const LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * OpenTelemetry severity numbers (logs data model). Used by the OTLP export
 * mapper and surfaced in the viewer so the field set is portable to any backend.
 */
export const SEVERITY_NUMBER: Record<LogLevel, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

export function isLevel(value: string): value is LogLevel {
  return (LEVELS as readonly string[]).includes(value);
}

export function isLevelSetting(value: string): value is LevelSetting {
  return value === "silent" || isLevel(value);
}

/** Map a pino numeric level back to its label (nearest at/below). */
export function levelFromValue(value: number): LogLevel {
  let result: LogLevel = "trace";
  for (const level of LEVELS) {
    if (value >= LEVEL_VALUES[level]) result = level;
  }
  return result;
}

/** Whether `level` is at or above the `threshold` (i.e. would be emitted). */
export function meetsThreshold(
  level: LogLevel,
  threshold: LevelSetting
): boolean {
  if (threshold === "silent") return false;
  return LEVEL_VALUES[level] >= LEVEL_VALUES[threshold];
}
