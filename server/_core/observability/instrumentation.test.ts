import { describe, it, expect, afterEach } from "vitest";
import { runWithContext } from "./context";
import {
  startRootSpan,
  startSpan,
  withSpan,
  getTrace,
  recentTraces,
} from "./tracer";
import { generateTraceId, generateSpanId, generateRequestId } from "./ids";
import { logger, logStore, setLevel, getLevel } from "./logger";

function withRequest<T>(fn: () => T): { traceId: string; result: T } {
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const result = runWithContext(
    {
      requestId: generateRequestId(),
      traceId,
      spanId,
      userId: 42,
      tenantId: 7,
      route: "rpc:test",
    },
    fn
  );
  return { traceId, result };
}

describe("tracer correlation", () => {
  it("nests child spans under the root with a shared trace id", () => {
    const { traceId } = withRequest(() => {
      const root = startRootSpan("GET /x", { kind: "server" });
      const child = startSpan("db.query", {
        attributes: { "db.statement": "select 1" },
      });
      child.end();
      root.end();
    });

    const spans = getTrace(traceId);
    expect(spans).toHaveLength(2);
    const root = spans.find(s => !s.parentSpanId);
    const child = spans.find(s => s.parentSpanId);
    expect(root).toBeDefined();
    expect(child?.parentSpanId).toBe(root?.spanId);
    expect(child?.name).toBe("db.query");
    expect(spans.every(s => s.traceId === traceId)).toBe(true);
  });

  it("records error status and re-throws through withSpan", async () => {
    let traceId = "";
    await expect(
      (async () => {
        const ctx = withRequest(() => {});
        traceId = ctx.traceId;
        await runWithContext(
          {
            requestId: generateRequestId(),
            traceId,
            spanId: generateSpanId(),
          },
          () =>
            withSpan("risky", async () => {
              throw new Error("boom");
            })
        );
      })()
    ).rejects.toThrow("boom");

    const errored = getTrace(traceId).find(s => s.name === "risky");
    expect(errored?.status).toBe("error");
    expect(errored?.statusMessage).toBe("boom");
  });

  it("summarises a trace with root name and span count", () => {
    const { traceId } = withRequest(() => {
      const root = startRootSpan("GET /summary", {
        kind: "server",
        attributes: { request_id: "req_summary", route: "GET /summary" },
      });
      startSpan("a").end();
      startSpan("b").end();
      root.end();
    });
    const summary = recentTraces(100).find(s => s.traceId === traceId);
    expect(summary).toBeDefined();
    expect(summary?.rootName).toBe("GET /summary");
    expect(summary?.spanCount).toBe(3);
  });
});

describe("logger → buffer correlation", () => {
  const original = getLevel();
  afterEach(() => setLevel(original));

  it("stamps context fields onto buffered log records", () => {
    setLevel("debug");
    const marker = `obs-test-${Date.now()}`;
    withRequest(() => {
      logger.info({ marker }, "correlated line");
    });
    const rec = logStore.query({ search: marker })[0];
    expect(rec).toBeDefined();
    expect(rec.userId).toBe(42);
    expect(rec.tenantId).toBe(7);
    expect(rec.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(rec.msg).toBe("correlated line");
  });
});
