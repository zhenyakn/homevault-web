import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { gunzipSync } from "zlib";

import { RingBuffer, LogStore } from "./ringBuffer";
import { RotatingFileSink, listLogFiles } from "./fileSink";
import {
  parseTraceparent,
  formatTraceparent,
  generateTraceId,
  generateSpanId,
} from "./ids";
import {
  levelFromValue,
  meetsThreshold,
  SEVERITY_NUMBER,
} from "./levels";
import { REDACT_PATHS } from "./redact";
import {
  runWithContext,
  getContext,
  updateContext,
  contextFields,
} from "./context";

describe("RingBuffer", () => {
  it("retains items in FIFO order under capacity", () => {
    const rb = new RingBuffer<number>(5);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
    expect(rb.size).toBe(3);
  });

  it("evicts the oldest entries when over capacity", () => {
    const rb = new RingBuffer<number>(3);
    for (let i = 1; i <= 6; i++) rb.push(i);
    expect(rb.toArray()).toEqual([4, 5, 6]);
    expect(rb.size).toBe(3);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });
});

describe("LogStore", () => {
  let store: LogStore;
  beforeEach(() => {
    store = new LogStore(100);
    store.add({
      time: Date.now(),
      level: "info",
      msg: "user logged in",
      namespace: "auth",
      tenantId: 1,
      userId: 7,
      requestId: "req_a",
      fields: { ip: "1.2.3.4" },
    });
    store.add({
      time: Date.now(),
      level: "error",
      msg: "db connection failed",
      namespace: "db",
      tenantId: 2,
      requestId: "req_b",
      fields: { code: "ECONN" },
    });
    store.add({
      time: Date.now(),
      level: "debug",
      msg: "cache hit",
      namespace: "cache",
      tenantId: 1,
      fields: {},
    });
  });

  it("filters by minimum level", () => {
    const errs = store.query({ minLevel: "error" });
    expect(errs.map(r => r.msg)).toEqual(["db connection failed"]);
  });

  it("filters by tenant for per-tenant access control", () => {
    const t1 = store.query({ tenantId: 1 });
    expect(t1.every(r => r.tenantId === 1)).toBe(true);
    expect(t1).toHaveLength(2);
  });

  it("full-text searches across msg and fields", () => {
    expect(store.query({ search: "ECONN" }).map(r => r.msg)).toEqual([
      "db connection failed",
    ]);
    expect(store.query({ search: "logged" }).map(r => r.msg)).toEqual([
      "user logged in",
    ]);
  });

  it("supports the afterSeq live-tail cursor", () => {
    const last = store.lastSeq;
    store.add({ time: Date.now(), level: "info", msg: "new one", fields: {} });
    const fresh = store.query({ afterSeq: last });
    expect(fresh.map(r => r.msg)).toEqual(["new one"]);
  });

  it("lists distinct namespaces", () => {
    expect(store.namespaces()).toEqual(["auth", "cache", "db"]);
  });
});

describe("levels", () => {
  it("maps pino numeric values to labels", () => {
    expect(levelFromValue(30)).toBe("info");
    expect(levelFromValue(55)).toBe("error");
    expect(levelFromValue(60)).toBe("fatal");
  });

  it("evaluates thresholds and silent", () => {
    expect(meetsThreshold("error", "warn")).toBe(true);
    expect(meetsThreshold("debug", "info")).toBe(false);
    expect(meetsThreshold("fatal", "silent")).toBe(false);
  });

  it("aligns to OTel severity numbers", () => {
    expect(SEVERITY_NUMBER.info).toBe(9);
    expect(SEVERITY_NUMBER.fatal).toBe(21);
  });
});

describe("trace context (W3C)", () => {
  it("round-trips a traceparent header", () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const header = formatTraceparent(traceId, spanId, true);
    const parsed = parseTraceparent(header);
    expect(parsed).toEqual({ traceId, parentSpanId: spanId, sampled: true });
  });

  it("generates spec-compliant id lengths", () => {
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects malformed and all-zero headers", () => {
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
    expect(
      parseTraceparent(`00-${"0".repeat(32)}-${"0".repeat(16)}-01`)
    ).toBeNull();
  });
});

describe("context propagation", () => {
  it("isolates context per async scope and folds in fields", () => {
    expect(getContext()).toBeUndefined();
    runWithContext(
      {
        requestId: "req_x",
        traceId: "t",
        spanId: "s",
        userId: 5,
        tenantId: 9,
        route: "rpc:test",
      },
      () => {
        expect(getContext()?.userId).toBe(5);
        updateContext({ userId: 6 });
        const f = contextFields();
        expect(f.user_id).toBe(6);
        expect(f.tenant_id).toBe(9);
        expect(f.request_id).toBe("req_x");
      }
    );
    expect(getContext()).toBeUndefined();
  });
});

describe("redaction policy", () => {
  it("covers credential headers and common secret fields", () => {
    expect(REDACT_PATHS).toContain("req.headers.authorization");
    expect(REDACT_PATHS).toContain("password");
    expect(REDACT_PATHS).toContain("*.token");
  });
});

describe("RotatingFileSink", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hv-logs-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes NDJSON lines to the active file", async () => {
    const sink = new RotatingFileSink({
      dir,
      maxSizeBytes: 1_000_000,
      maxFiles: 3,
      compress: false,
    });
    sink.write(JSON.stringify({ msg: "one" }));
    sink.write(JSON.stringify({ msg: "two" }));
    await sink.flush();
    const content = await fs.readFile(sink.activePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).msg).toBe("one");
  });

  it("rotates and gzip-compresses when over the size cap", async () => {
    const sink = new RotatingFileSink({
      dir,
      maxSizeBytes: 200,
      maxFiles: 3,
      compress: true,
    });
    for (let i = 0; i < 50; i++) {
      sink.write(JSON.stringify({ i, pad: "x".repeat(20) }));
    }
    await sink.flush();
    const rotated = path.join(dir, "homevault.log.1.gz");
    expect(existsSync(rotated)).toBe(true);
    const text = gunzipSync(await fs.readFile(rotated)).toString("utf-8");
    expect(text).toContain('"pad"');
  });

  it("discards rotated files beyond maxFiles", async () => {
    const sink = new RotatingFileSink({
      dir,
      maxSizeBytes: 100,
      maxFiles: 2,
      compress: false,
    });
    for (let i = 0; i < 100; i++) {
      sink.write(JSON.stringify({ i, pad: "y".repeat(30) }));
      await sink.flush();
    }
    const files = listLogFiles(dir);
    const rotatedCount = files.filter(f => /\.log\.\d+$/.test(f.name)).length;
    expect(rotatedCount).toBeLessThanOrEqual(2);
  });

  it("age-prunes rotated files past the retention window", async () => {
    const sink = new RotatingFileSink({
      dir,
      maxSizeBytes: 100,
      maxFiles: 5,
      retentionDays: 1,
      compress: false,
    });
    // Force a rotation so a .1 file exists.
    for (let i = 0; i < 20; i++) sink.write(JSON.stringify({ pad: "z".repeat(40) }));
    await sink.flush();
    const rotated = path.join(dir, "homevault.log.1");
    expect(existsSync(rotated)).toBe(true);
    // Backdate it well beyond the 1-day window, then prune.
    const old = Date.now() / 1000 - 5 * 24 * 60 * 60;
    await fs.utimes(rotated, old, old);
    await sink.pruneByAge();
    expect(existsSync(rotated)).toBe(false);
  });
});
