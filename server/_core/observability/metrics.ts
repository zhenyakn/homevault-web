/**
 * The metrics pillar: a tiny in-process registry that produces RED metrics
 * (Rate, Errors, Duration) for HTTP and tRPC traffic, plus a per-tenant cut.
 *
 * Counters + fixed-bucket histograms only — enough for a Prometheus exposition
 * endpoint and the in-app dashboard, with no dependency. Percentiles are
 * estimated from the histogram buckets (the same technique Prometheus'
 * histogram_quantile uses), so p50/p95/p99 stay cheap and bounded in memory.
 */

import { obsConfig } from "./config";

const cfg = obsConfig;

/** Latency buckets in milliseconds (upper bounds). */
const DURATION_BUCKETS_MS = [
  1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

function labelKey(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort()
    .map(k => `${k}="${labels[k]}"`)
    .join(",");
}

class Counter {
  private values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string
  ) {}

  inc(labels: Record<string, string> = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }

  entries(): { labels: string; value: number }[] {
    return Array.from(this.values).map(([labels, value]) => ({
      labels,
      value,
    }));
  }

  total(): number {
    let sum = 0;
    for (const v of Array.from(this.values.values())) sum += v;
    return sum;
  }
}

interface HistogramSeries {
  buckets: number[]; // cumulative-ready per-bucket counts (aligned to bounds)
  sum: number;
  count: number;
}

class Histogram {
  private series = new Map<string, HistogramSeries>();
  constructor(
    readonly name: string,
    readonly help: string,
    readonly bounds: number[] = DURATION_BUCKETS_MS
  ) {}

  observe(value: number, labels: Record<string, string> = {}): void {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { buckets: new Array(this.bounds.length + 1).fill(0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    let i = 0;
    while (i < this.bounds.length && value > this.bounds[i]) i++;
    s.buckets[i]++;
    s.sum += value;
    s.count++;
  }

  seriesEntries(): { labels: string; series: HistogramSeries }[] {
    return Array.from(this.series).map(([labels, series]) => ({
      labels,
      series,
    }));
  }

  /** Estimate a quantile (0..1) for one label set from its bucket counts. */
  quantile(q: number, labels: Record<string, string> = {}): number {
    const s = this.series.get(labelKey(labels));
    if (!s || s.count === 0) return 0;
    const target = q * s.count;
    let cumulative = 0;
    for (let i = 0; i < s.buckets.length; i++) {
      cumulative += s.buckets[i];
      if (cumulative >= target) {
        return i < this.bounds.length
          ? this.bounds[i]
          : this.bounds[this.bounds.length - 1];
      }
    }
    return this.bounds[this.bounds.length - 1];
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const requestsTotal = new Counter(
  "homevault_requests_total",
  "Total requests by transport, route, method and status class."
);
export const requestErrorsTotal = new Counter(
  "homevault_request_errors_total",
  "Total errored requests (5xx / thrown) by transport and route."
);
export const requestDuration = new Histogram(
  "homevault_request_duration_ms",
  "Request handling duration in milliseconds."
);

export interface RecordRequestArgs {
  transport: "http" | "rpc";
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  errored: boolean;
  tenantId?: number;
}

export function recordRequest(a: RecordRequestArgs): void {
  if (!cfg.metrics.enabled) return;
  const statusClass = `${Math.floor(a.statusCode / 100)}xx`;
  const labels = {
    transport: a.transport,
    route: a.route,
    method: a.method,
    status: statusClass,
  };
  requestsTotal.inc(labels);
  requestDuration.observe(a.durationMs, {
    transport: a.transport,
    route: a.route,
  });
  if (a.errored || a.statusCode >= 500) {
    requestErrorsTotal.inc({ transport: a.transport, route: a.route });
  }
}

// ── In-app dashboard summary ──────────────────────────────────────────────────
export interface MetricsSummary {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  latency: { p50: number; p95: number; p99: number };
  topRoutes: {
    route: string;
    transport: string;
    count: number;
    p95: number;
  }[];
}

export function metricsSummary(): MetricsSummary {
  const total = requestsTotal.total();
  const errors = requestErrorsTotal.total();

  // Aggregate latency across all routes for global percentiles.
  const routeAgg = new Map<
    string,
    { transport: string; route: string; count: number }
  >();
  for (const { labels } of requestDuration.seriesEntries()) {
    const parsed = parseLabels(labels);
    const route = parsed.route ?? "?";
    const transport = parsed.transport ?? "?";
    const key = `${transport}|${route}`;
    const agg = routeAgg.get(key) ?? { transport, route, count: 0 };
    agg.count = countForRoute(transport, route);
    routeAgg.set(key, agg);
  }

  const topRoutes = Array.from(routeAgg.values())
    .map(r => ({
      route: r.route,
      transport: r.transport,
      count: r.count,
      p95: requestDuration.quantile(0.95, {
        transport: r.transport,
        route: r.route,
      }),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRequests: total,
    totalErrors: errors,
    errorRate: total > 0 ? errors / total : 0,
    latency: {
      p50: globalQuantile(0.5),
      p95: globalQuantile(0.95),
      p99: globalQuantile(0.99),
    },
    topRoutes,
  };
}

function countForRoute(transport: string, route: string): number {
  let total = 0;
  for (const { labels, value } of requestsTotal.entries()) {
    const p = parseLabels(labels);
    if (p.transport === transport && p.route === route) total += value;
  }
  return total;
}

/** Pool every route's histogram into a single global quantile estimate. */
function globalQuantile(q: number): number {
  const merged = new Array(DURATION_BUCKETS_MS.length + 1).fill(0);
  let count = 0;
  for (const { series } of requestDuration.seriesEntries()) {
    for (let i = 0; i < series.buckets.length; i++) merged[i] += series.buckets[i];
    count += series.count;
  }
  if (count === 0) return 0;
  const target = q * count;
  let cumulative = 0;
  for (let i = 0; i < merged.length; i++) {
    cumulative += merged[i];
    if (cumulative >= target) {
      return i < DURATION_BUCKETS_MS.length
        ? DURATION_BUCKETS_MS[i]
        : DURATION_BUCKETS_MS[DURATION_BUCKETS_MS.length - 1];
    }
  }
  return DURATION_BUCKETS_MS[DURATION_BUCKETS_MS.length - 1];
}

function parseLabels(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(",")) {
    const m = part.match(/^(\w+)="(.*)"$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ── Prometheus text exposition ────────────────────────────────────────────────
export function renderPrometheus(): string {
  const lines: string[] = [];
  const emitCounter = (c: Counter) => {
    lines.push(`# HELP ${c.name} ${c.help}`);
    lines.push(`# TYPE ${c.name} counter`);
    for (const { labels, value } of c.entries()) {
      lines.push(`${c.name}{${labels}} ${value}`);
    }
  };
  emitCounter(requestsTotal);
  emitCounter(requestErrorsTotal);

  lines.push(`# HELP ${requestDuration.name} ${requestDuration.help}`);
  lines.push(`# TYPE ${requestDuration.name} histogram`);
  for (const { labels, series } of requestDuration.seriesEntries()) {
    let cumulative = 0;
    for (let i = 0; i < requestDuration.bounds.length; i++) {
      cumulative += series.buckets[i];
      lines.push(
        `${requestDuration.name}_bucket{${labels},le="${requestDuration.bounds[i]}"} ${cumulative}`
      );
    }
    cumulative += series.buckets[requestDuration.bounds.length];
    lines.push(
      `${requestDuration.name}_bucket{${labels},le="+Inf"} ${cumulative}`
    );
    lines.push(`${requestDuration.name}_sum{${labels}} ${series.sum}`);
    lines.push(`${requestDuration.name}_count{${labels}} ${series.count}`);
  }
  return lines.join("\n") + "\n";
}
