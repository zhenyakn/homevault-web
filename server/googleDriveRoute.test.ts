import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { AddressInfo } from "net";

const hoisted = vi.hoisted(() => ({
  ctxState: { user: { id: 1, role: "admin" } as any },
  gdriveMock: {
    buildConnectAuthUrl: null as any,
    completeConnect: null as any,
    disconnectGoogleDrive: null as any,
    getConnectionStatus: null as any,
    isGoogleEnvConfigured: null as any,
  },
}));

vi.mock("./_core/context", () => ({
  createContext: async () => ({
    user: hoisted.ctxState.user,
    propertyId: 1,
    req: {},
    res: {},
  }),
}));

vi.mock("./storage/gdrive", () => hoisted.gdriveMock);

vi.mock("./storage/types", async () => {
  class StorageNotConfiguredError extends Error { code = "STORAGE_NOT_CONFIGURED" as const; }
  class StorageOperationError extends Error { code = "STORAGE_OPERATION_FAILED" as const; backend: any; }
  return { StorageNotConfiguredError, StorageOperationError };
});

hoisted.gdriveMock.buildConnectAuthUrl = vi.fn(() => "https://google.example/auth");
hoisted.gdriveMock.completeConnect = vi.fn();
hoisted.gdriveMock.disconnectGoogleDrive = vi.fn();
hoisted.gdriveMock.getConnectionStatus = vi.fn();
hoisted.gdriveMock.isGoogleEnvConfigured = vi.fn(() => true);

import { googleDriveRouter } from "./googleDriveRoute";

const gdriveMock = hoisted.gdriveMock;

function startApp() {
  const app = express();
  app.use(googleDriveRouter);
  const server = http.createServer(app);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function fetchUrl(url: string, init?: RequestInit) {
  return fetch(url, { ...init, redirect: "manual" });
}

describe("GET /api/google-drive/status", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    hoisted.ctxState.user = { id: 1, role: "admin" };
    Object.values(gdriveMock).forEach((fn) => (fn as any).mockReset?.());
    gdriveMock.isGoogleEnvConfigured.mockReturnValue(true);
    if (app) await app.close();
    app = await startApp();
  });

  it("returns connection + configured flags for admins", async () => {
    gdriveMock.getConnectionStatus.mockResolvedValueOnce({ connected: true, email: "owner@x" });
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      connected: true,
      email: "owner@x",
    });
  });

  it("403 when caller is not an admin", async () => {
    hoisted.ctxState.user = { id: 1, role: "user" };
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    hoisted.ctxState.user = null;
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/google-drive/connect", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    hoisted.ctxState.user = { id: 1, role: "admin" };
    Object.values(gdriveMock).forEach((fn) => (fn as any).mockReset?.());
    gdriveMock.isGoogleEnvConfigured.mockReturnValue(true);
    if (app) await app.close();
    app = await startApp();
  });

  it("redirects to Google's auth URL", async () => {
    gdriveMock.buildConnectAuthUrl.mockReturnValueOnce("https://google.example/auth?scope=foo");
    const res = await fetchUrl(`${app.url}/api/google-drive/connect`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://google.example/auth?scope=foo");
  });

  it("503 when env is not configured", async () => {
    const { StorageNotConfiguredError } = await import("./storage/types");
    gdriveMock.buildConnectAuthUrl.mockImplementationOnce(() => {
      throw new StorageNotConfiguredError("missing GOOGLE_*");
    });
    const res = await fetchUrl(`${app.url}/api/google-drive/connect`);
    expect(res.status).toBe(503);
  });
});

describe("GET /api/google-drive/callback", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    hoisted.ctxState.user = { id: 1, role: "admin" };
    Object.values(gdriveMock).forEach((fn) => (fn as any).mockReset?.());
    if (app) await app.close();
    app = await startApp();
  });

  it("redirects to /admin/google-drive?connected=1 on success", async () => {
    gdriveMock.completeConnect.mockResolvedValueOnce({ email: "owner@x" });
    const res = await fetchUrl(`${app.url}/api/google-drive/callback?code=abc`);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("connected=1");
    expect(loc).toContain("email=owner%40x");
  });

  it("redirects with error=... when Google returned an error", async () => {
    const res = await fetchUrl(`${app.url}/api/google-drive/callback?error=access_denied`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=access_denied");
  });

  it("400 when no code is supplied", async () => {
    const res = await fetchUrl(`${app.url}/api/google-drive/callback`);
    expect(res.status).toBe(400);
  });

  it("redirects with error=... when completeConnect throws", async () => {
    gdriveMock.completeConnect.mockRejectedValueOnce(new Error("boom"));
    const res = await fetchUrl(`${app.url}/api/google-drive/callback?code=abc`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=");
  });

  it("requires admin auth", async () => {
    hoisted.ctxState.user = { id: 1, role: "user" };
    const res = await fetchUrl(`${app.url}/api/google-drive/callback?code=abc`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/google-drive/disconnect", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    hoisted.ctxState.user = { id: 1, role: "admin" };
    Object.values(gdriveMock).forEach((fn) => (fn as any).mockReset?.());
    if (app) await app.close();
    app = await startApp();
  });

  it("clears the connection", async () => {
    gdriveMock.disconnectGoogleDrive.mockResolvedValueOnce(undefined);
    const res = await fetchUrl(`${app.url}/api/google-drive/disconnect`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(gdriveMock.disconnectGoogleDrive).toHaveBeenCalled();
  });

  it("403 for non-admin callers", async () => {
    hoisted.ctxState.user = { id: 1, role: "user" };
    const res = await fetchUrl(`${app.url}/api/google-drive/disconnect`, { method: "POST" });
    expect(res.status).toBe(403);
  });
});
