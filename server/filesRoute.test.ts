import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response } from "express";
import { Readable } from "stream";
import http from "http";
import { AddressInfo } from "net";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const ctxState: { user: any } = { user: { id: 7, role: "user" } };

vi.mock("./_core/context", () => ({
  createContext: async () => ({
    user: ctxState.user,
    propertyId: 1,
    req: {},
    res: {},
  }),
}));

const filesState: { rows: any[]; deleted: string[] } = { rows: [], deleted: [] };

vi.mock("./files", async () => {
  return {
    buildProxyUrl: (id: string, name: string) => `/api/files/${id}/${encodeURIComponent(name)}`,
    parseProxyUrl: (url: string) => {
      if (!url.startsWith("/api/files/")) return null;
      const id = url.slice("/api/files/".length).split("/")[0]!;
      return { id };
    },
    getFileForOwner: async (id: string, ownerUserId: number) => {
      return filesState.rows.find(r => r.id === id && r.ownerUserId === ownerUserId) ?? null;
    },
    deleteFileForOwner: async (id: string, _ownerUserId: number) => {
      filesState.deleted.push(id);
      return { deleted: true };
    },
  };
});

const backendStub = {
  s3: { name: "s3" as const, download: vi.fn(), delete: vi.fn(), upload: vi.fn() },
  gdrive: { name: "gdrive" as const, download: vi.fn(), delete: vi.fn(), upload: vi.fn() },
};

vi.mock("./storage", () => ({
  getBackendByName: (name: "s3" | "gdrive") => backendStub[name],
  getActiveBackend: () => backendStub.gdrive,
  StorageNotConfiguredError: class extends Error {},
  StorageOperationError: class extends Error {},
}));

vi.mock("./storage/types", async () => {
  class StorageNotConfiguredError extends Error { code = "STORAGE_NOT_CONFIGURED" as const; }
  class StorageOperationError extends Error { code = "STORAGE_OPERATION_FAILED" as const; backend: any; }
  return { StorageNotConfiguredError, StorageOperationError };
});

import { filesRouter } from "./filesRoute";

// ─── Test helpers ────────────────────────────────────────────────────────────

function startApp() {
  const app = express();
  app.use(filesRouter);
  const server = http.createServer(app);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

async function fetchUrl(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, redirect: "manual" });
  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/files/:id", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    ctxState.user = { id: 7, role: "user" };
    filesState.rows = [];
    filesState.deleted = [];
    backendStub.s3.download.mockReset();
    backendStub.gdrive.download.mockReset();
    if (app) await app.close();
    app = await startApp();
  });

  it("401 when unauthenticated", async () => {
    ctxState.user = null;
    const res = await fetchUrl(`${app.url}/api/files/abc12345`);
    expect(res.status).toBe(401);
  });

  it("404 when the file does not exist or belongs to someone else", async () => {
    filesState.rows = [
      { id: "abc12345", ownerUserId: 99, backend: "gdrive", externalId: "ext", originalName: "x.pdf", mimeType: "application/pdf", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    const res = await fetchUrl(`${app.url}/api/files/abc12345`);
    expect(res.status).toBe(404);
  });

  it("302-redirects when backend returns kind:'redirect'", async () => {
    filesState.rows = [
      { id: "s3file12", ownerUserId: 7, backend: "s3", externalId: "uploads/7/x.pdf", originalName: "x.pdf", mimeType: "application/pdf", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    backendStub.s3.download.mockResolvedValueOnce({
      kind: "redirect",
      url: "https://signed.example.com/x.pdf",
      mimeType: "application/pdf",
    });
    const res = await fetchUrl(`${app.url}/api/files/s3file12`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example.com/x.pdf");
  });

  it("streams content with the stored mimeType when backend returns kind:'stream'", async () => {
    filesState.rows = [
      { id: "gd123456", ownerUserId: 7, backend: "gdrive", externalId: "drive-id", originalName: "hello.txt", mimeType: "text/plain", size: 5, createdAt: new Date(), deletedAt: null },
    ];
    backendStub.gdrive.download.mockResolvedValueOnce({
      kind: "stream",
      stream: Readable.from(Buffer.from("hello")),
      mimeType: "text/plain",
      size: 5,
    });

    const res = await fetchUrl(`${app.url}/api/files/gd123456`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toBe("hello");
  });

  it("502 when backend throws", async () => {
    filesState.rows = [
      { id: "gd234567", ownerUserId: 7, backend: "gdrive", externalId: "drive-id", originalName: "h.txt", mimeType: "text/plain", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    const { StorageOperationError } = await import("./storage/types");
    backendStub.gdrive.download.mockRejectedValueOnce(new StorageOperationError("gdrive" as any, "boom"));
    const res = await fetchUrl(`${app.url}/api/files/gd234567`);
    expect(res.status).toBe(502);
  });

  it("503 when backend is not configured (e.g. token revoked)", async () => {
    filesState.rows = [
      { id: "gd345678", ownerUserId: 7, backend: "gdrive", externalId: "drive-id", originalName: "h.txt", mimeType: "text/plain", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    const { StorageNotConfiguredError } = await import("./storage/types");
    backendStub.gdrive.download.mockRejectedValueOnce(new StorageNotConfiguredError("not connected"));
    const res = await fetchUrl(`${app.url}/api/files/gd345678`);
    expect(res.status).toBe(503);
  });
});

describe("DELETE /api/files/:id", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    ctxState.user = { id: 7, role: "user" };
    filesState.rows = [];
    filesState.deleted = [];
    if (app) await app.close();
    app = await startApp();
  });

  it("removes the file when owned by the caller", async () => {
    filesState.rows = [
      { id: "gd456789", ownerUserId: 7, backend: "gdrive", externalId: "drive-id", originalName: "h.txt", mimeType: "text/plain", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    const res = await fetchUrl(`${app.url}/api/files/gd456789`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(filesState.deleted).toContain("gd456789");
  });

  it("404 when not the owner", async () => {
    filesState.rows = [
      { id: "gd567890", ownerUserId: 99, backend: "gdrive", externalId: "drive-id", originalName: "h.txt", mimeType: "text/plain", size: 0, createdAt: new Date(), deletedAt: null },
    ];
    const res = await fetchUrl(`${app.url}/api/files/gd567890`, { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(filesState.deleted.length).toBe(0);
  });
});
