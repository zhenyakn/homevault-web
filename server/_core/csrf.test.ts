import { describe, expect, it, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import {
  csrfIssueMiddleware,
  csrfRequireMiddleware,
  CSRF_COOKIE,
  CSRF_HEADER,
} from "./csrf";

// Force production-like behaviour for the test so the middleware actually
// enforces. `csrfRequireMiddleware` skips when NODE_ENV=test, which is what
// the route tests rely on — here we want to exercise the real logic.
const origNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  process.env.NODE_ENV = "development";
});
afterEach(() => {
  process.env.NODE_ENV = origNodeEnv;
});

function startApp() {
  const app = express();
  app.use(csrfIssueMiddleware);
  app.get("/safe", (_req, res) => res.json({ ok: true }));
  app.post("/danger", csrfRequireMiddleware, (_req, res) =>
    res.json({ ok: true })
  );
  const server = http.createServer(app);
  return new Promise<{ url: string; close: () => Promise<void> }>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

describe("csrfIssueMiddleware", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("issues a csrf_token cookie on first request", async () => {
    const res = await fetch(`${app.url}/safe`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${CSRF_COOKIE}=`);
  });

  it("does NOT re-issue the cookie when one is already present", async () => {
    const res = await fetch(`${app.url}/safe`, {
      headers: { cookie: `${CSRF_COOKIE}=existingValue` },
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("csrfRequireMiddleware", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("403 when both cookie and header are missing", async () => {
    const res = await fetch(`${app.url}/danger`, { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("403 when cookie is set but header is missing", async () => {
    const res = await fetch(`${app.url}/danger`, {
      method: "POST",
      headers: { cookie: `${CSRF_COOKIE}=abc123` },
    });
    expect(res.status).toBe(403);
  });

  it("403 when header is set but cookie is missing", async () => {
    const res = await fetch(`${app.url}/danger`, {
      method: "POST",
      headers: { [CSRF_HEADER]: "abc123" },
    });
    expect(res.status).toBe(403);
  });

  it("403 when header and cookie disagree", async () => {
    const res = await fetch(`${app.url}/danger`, {
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=cookie-value`,
        [CSRF_HEADER]: "different-header",
      },
    });
    expect(res.status).toBe(403);
  });

  it("200 when header matches cookie", async () => {
    const res = await fetch(`${app.url}/danger`, {
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE}=match-me`,
        [CSRF_HEADER]: "match-me",
      },
    });
    expect(res.status).toBe(200);
  });

  it("skips entirely under NODE_ENV=test", async () => {
    process.env.NODE_ENV = "test";
    const res = await fetch(`${app.url}/danger`, { method: "POST" });
    expect(res.status).toBe(200);
  });
});
