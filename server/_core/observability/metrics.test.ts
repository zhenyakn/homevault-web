import { describe, it, expect } from "vitest";
import {
  recordRequest,
  metricsSummary,
  renderPrometheus,
} from "./metrics";

describe("metrics (RED)", () => {
  it("aggregates rate, errors and latency percentiles", () => {
    // 100 fast OK calls + a handful of slow/errored ones.
    for (let i = 0; i < 100; i++) {
      recordRequest({
        transport: "rpc",
        route: "property.list",
        method: "QUERY",
        statusCode: 200,
        durationMs: 5,
        errored: false,
      });
    }
    for (let i = 0; i < 5; i++) {
      recordRequest({
        transport: "rpc",
        route: "property.list",
        method: "QUERY",
        statusCode: 500,
        durationMs: 800,
        errored: true,
      });
    }

    const s = metricsSummary();
    expect(s.totalRequests).toBeGreaterThanOrEqual(105);
    expect(s.totalErrors).toBeGreaterThanOrEqual(5);
    expect(s.errorRate).toBeGreaterThan(0);
    // p50 should sit in the fast bucket, p99 in a slow one.
    expect(s.latency.p50).toBeLessThanOrEqual(10);
    expect(s.latency.p99).toBeGreaterThanOrEqual(s.latency.p50);
    expect(s.topRoutes[0].route).toBe("property.list");
  });

  it("renders Prometheus exposition format", () => {
    recordRequest({
      transport: "http",
      route: "/health",
      method: "GET",
      statusCode: 200,
      durationMs: 2,
      errored: false,
    });
    const text = renderPrometheus();
    expect(text).toContain("# TYPE homevault_requests_total counter");
    expect(text).toContain("homevault_request_duration_ms_bucket");
    expect(text).toContain('le="+Inf"');
  });
});
