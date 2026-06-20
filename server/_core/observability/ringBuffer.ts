/**
 * Bounded in-memory ring buffers for the in-app viewer.
 *
 * `RingBuffer<T>` is a fixed-capacity FIFO that drops the oldest entry on
 * overflow — O(1) push, bounded memory, restart-volatile (the rotating log
 * files are the durable record). `LogStore` and `TraceStore` wrap it with the
 * query shapes the viewer + per-tenant access controls need.
 */

import { LEVELS, type LogLevel, levelFromValue } from "./levels";

export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;

  constructor(public readonly capacity: number) {
    if (capacity < 1) throw new Error("RingBuffer capacity must be >= 1");
    this.items = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    const end = (this.start + this.count) % this.capacity;
    this.items[end] = item;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Full: overwrite oldest and advance the window.
      this.start = (this.start + 1) % this.capacity;
    }
  }

  get size(): number {
    return this.count;
  }

  /** Snapshot, oldest → newest. */
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.items[(this.start + i) % this.capacity]!);
    }
    return out;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}

/** A single structured log record as retained for the viewer. */
export interface LogRecord {
  /** Monotonic per-process sequence id (stable cursor for "since" polling). */
  seq: number;
  time: number;
  level: LogLevel;
  msg: string;
  namespace?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  userId?: number;
  tenantId?: number;
  route?: string;
  /** Remaining structured fields (already redacted by pino). */
  fields: Record<string, unknown>;
}

export interface LogQuery {
  /** Minimum level to include. */
  minLevel?: LogLevel;
  namespace?: string;
  tenantId?: number;
  userId?: number;
  requestId?: string;
  traceId?: string;
  /** Case-insensitive substring match over msg + serialized fields. */
  search?: string;
  /** Only records with seq > afterSeq (live-tail cursor). */
  afterSeq?: number;
  limit?: number;
}

const LEVEL_RANK: Record<LogLevel, number> = Object.fromEntries(
  LEVELS.map((l, i) => [l, i])
) as Record<LogLevel, number>;

export class LogStore {
  private readonly buffer: RingBuffer<LogRecord>;
  private seq = 0;

  constructor(capacity: number) {
    this.buffer = new RingBuffer<LogRecord>(capacity);
  }

  /** Ingest one parsed log line. Returns the assigned sequence id. */
  add(record: Omit<LogRecord, "seq">): number {
    const seq = ++this.seq;
    this.buffer.push({ ...record, seq });
    return seq;
  }

  get lastSeq(): number {
    return this.seq;
  }

  query(q: LogQuery = {}): LogRecord[] {
    const minRank = q.minLevel != null ? LEVEL_RANK[q.minLevel] : -1;
    const search = q.search?.toLowerCase();
    const limit = q.limit ?? 200;

    const matched: LogRecord[] = [];
    // Walk newest → oldest so `limit` keeps the most recent matches.
    const all = this.buffer.toArray();
    for (let i = all.length - 1; i >= 0; i--) {
      const r = all[i];
      if (q.afterSeq != null && r.seq <= q.afterSeq) break;
      if (minRank >= 0 && LEVEL_RANK[r.level] < minRank) continue;
      if (q.namespace && r.namespace !== q.namespace) continue;
      if (q.tenantId != null && r.tenantId !== q.tenantId) continue;
      if (q.userId != null && r.userId !== q.userId) continue;
      if (q.requestId && r.requestId !== q.requestId) continue;
      if (q.traceId && r.traceId !== q.traceId) continue;
      if (search && !matchesSearch(r, search)) continue;
      matched.push(r);
      if (matched.length >= limit) break;
    }
    // Return oldest → newest within the matched window.
    return matched.reverse();
  }

  /** Distinct namespaces currently in the buffer (for viewer filters). */
  namespaces(): string[] {
    const set = new Set<string>();
    for (const r of this.buffer.toArray()) {
      if (r.namespace) set.add(r.namespace);
    }
    return Array.from(set).sort();
  }

  clear(): void {
    this.buffer.clear();
  }
}

function matchesSearch(r: LogRecord, needle: string): boolean {
  if (r.msg.toLowerCase().includes(needle)) return true;
  if (r.requestId?.toLowerCase().includes(needle)) return true;
  if (r.traceId?.toLowerCase().includes(needle)) return true;
  if (r.namespace?.toLowerCase().includes(needle)) return true;
  try {
    return JSON.stringify(r.fields).toLowerCase().includes(needle);
  } catch {
    return false;
  }
}

export { levelFromValue };
