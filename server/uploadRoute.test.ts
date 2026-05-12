import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { AddressInfo } from "net";

const hoisted = vi.hoisted(() => ({
  ctxState: { user: { id: 7, role: "user" } as any },
  fileFlow: { uploadAndRegister: null as any },
}));

vi.mock("./_core/context", () => ({
  createContext: async () => ({
    user: hoisted.ctxState.user,
    propertyId: 1,
    req: {},
    res: {},
  }),
}));

vi.mock("./files", () => hoisted.fileFlow);

vi.mock("./storage/types", async () => {
  class StorageNotConfiguredError extends Error { code = "STORAGE_NOT_CONFIGURED" as const; }
  class StorageOperationError extends Error {
    code = "STORAGE_OPERATION_FAILED" as const;
    backend: any;
    constructor(backend: any, msg: string) { super(msg); this.backend = backend; }
  }
  return { StorageNotConfiguredError, StorageOperationError };
});

hoisted.fileFlow.uploadAndRegister = vi.fn();

import { uploadRouter } from "./uploadRoute";

function startApp() {
  const app = express();
  app.use(uploadRouter);
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

async function uploadFile(url: string, init: { mimeType?: string; content?: Buffer; filename?: string } = {}) {
  const body = new FormData();
  const blob = new Blob([init.content ?? Buffer.from("hi")], { type: init.mimeType ?? "image/png" });
  body.append("file", blob, init.filename ?? "tiny.png");
  return fetch(`${url}/api/upload`, { method: "POST", body });
}

describe("POST /api/upload", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    hoisted.ctxState.user = { id: 7, role: "user" };
    hoisted.fileFlow.uploadAndRegister.mockReset();
    if (app) await app.close();
    app = await startApp();
  });

  it("401 when unauthenticated", async () => {
    hoisted.ctxState.user = null;
    const res = await uploadFile(app.url);
    expect(res.status).toBe(401);
  });

  it("returns id + proxy url on success", async () => {
    hoisted.fileFlow.uploadAndRegister.mockResolvedValueOnce({
      record: {
        id: "fid1",
        originalName: "tiny.png",
        mimeType: "image/png",
        size: 2,
      },
      url: "/api/files/fid1/tiny.png",
    });
    const res = await uploadFile(app.url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: "fid1",
      url: "/api/files/fid1/tiny.png",
      filename: "tiny.png",
      mimeType: "image/png",
      size: 2,
    });
  });

  it("rejects disallowed mime types with 400", async () => {
    const res = await uploadFile(app.url, { mimeType: "application/x-evil" });
    expect(res.status).toBe(400);
    expect(hoisted.fileFlow.uploadAndRegister).not.toHaveBeenCalled();
  });

  it("503 when storage backend is not configured", async () => {
    const { StorageNotConfiguredError } = await import("./storage/types");
    hoisted.fileFlow.uploadAndRegister.mockRejectedValueOnce(
      new StorageNotConfiguredError("Google Drive is not connected"),
    );
    const res = await uploadFile(app.url);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Google Drive is not connected");
  });

  it("502 when storage backend operation fails", async () => {
    const { StorageOperationError } = await import("./storage/types");
    hoisted.fileFlow.uploadAndRegister.mockRejectedValueOnce(
      new StorageOperationError("gdrive" as any, "Drive 500"),
    );
    const res = await uploadFile(app.url);
    expect(res.status).toBe(502);
  });

  it("500 for unexpected errors", async () => {
    hoisted.fileFlow.uploadAndRegister.mockRejectedValueOnce(new Error("totally unexpected"));
    const res = await uploadFile(app.url);
    expect(res.status).toBe(500);
  });
});
