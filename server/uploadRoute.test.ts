import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";

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

// Real-enough magic bytes that `file-type` recognises as png. Resolution to a
// 1x1 transparent png — total 70 bytes. Used as the "valid happy path" payload.
const REAL_PNG = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010DCABE9D0000000049454E44AE426082",
  "hex",
);
const REAL_PDF = Buffer.from(
  "255044462D312E0A25E2E3CFD30A0A312030206F626A0A3C3C2F54797065202F436174616C6F672F50616765732032203020523E3E0A656E646F626A0A0A322030206F626A0A3C3C2F54797065202F50616765732F4B6964735B33203020525D2F436F756E7420313E3E0A656E646F626A0A0A332030206F626A0A3C3C2F54797065202F506167652F4D65646961426F785B302030203320335D2F506172656E742032203020523E3E0A656E646F626A0A0A7872656600",
  "hex",
);

async function uploadFile(url: string, init: { mimeType?: string; content?: Buffer; filename?: string } = {}) {
  const body = new FormData();
  const blob = new Blob([init.content ?? REAL_PNG], { type: init.mimeType ?? "image/png" });
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

  it("returns id + proxy url on success for a real PNG", async () => {
    hoisted.fileFlow.uploadAndRegister.mockResolvedValueOnce({
      record: {
        id: "fid1",
        originalName: "tiny.png",
        mimeType: "image/png",
        size: REAL_PNG.length,
      },
      url: "/api/files/fid1/tiny.png",
    });
    const res = await uploadFile(app.url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("fid1");
    expect(body.url).toBe("/api/files/fid1/tiny.png");
  });

  it("persists the SNIFFED mimeType, not the browser-supplied one", async () => {
    hoisted.fileFlow.uploadAndRegister.mockResolvedValueOnce({
      record: { id: "f", originalName: "evil.png", mimeType: "application/pdf", size: 0 },
      url: "/api/files/f",
    });
    // Browser CLAIMS image/png but the bytes are a PDF.
    await uploadFile(app.url, {
      mimeType: "image/png", // Lie — allowed by the first allowlist check.
      content: REAL_PDF,
      filename: "evil.png",
    });
    // The route uses the sniffed type ("application/pdf"), not "image/png",
    // when calling uploadAndRegister.
    const callArg = hoisted.fileFlow.uploadAndRegister.mock.calls[0]?.[0];
    expect(callArg?.mimeType).toBe("application/pdf");
  });

  it("rejects browser-disallowed mime types with 400", async () => {
    const res = await uploadFile(app.url, { mimeType: "application/x-evil" });
    expect(res.status).toBe(400);
    expect(hoisted.fileFlow.uploadAndRegister).not.toHaveBeenCalled();
  });

  it("rejects HTML payload claiming image/png (magic-byte sniff fix M2)", async () => {
    const htmlPayload = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    const res = await uploadFile(app.url, {
      mimeType: "image/png", // Lie
      content: htmlPayload,
      filename: "evil.png",
    });
    // 415 = Unsupported Media Type (magic-byte allowlist rejection)
    expect(res.status).toBe(415);
    expect(hoisted.fileFlow.uploadAndRegister).not.toHaveBeenCalled();
  });

  it("rejects unrecognised-format payloads (no magic bytes match)", async () => {
    const junk = Buffer.from("absolute garbage that nothing recognises", "utf8");
    const res = await uploadFile(app.url, {
      mimeType: "image/png",
      content: junk,
    });
    expect(res.status).toBe(415);
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
    expect(body.code).toBe("STORAGE_NOT_CONFIGURED");
  });

  it("503 with RECONNECT_REQUIRED when the message mentions invalid_grant", async () => {
    const { StorageNotConfiguredError } = await import("./storage/types");
    hoisted.fileFlow.uploadAndRegister.mockRejectedValueOnce(
      new StorageNotConfiguredError("Google Drive needs reconnecting (invalid_grant)."),
    );
    const res = await uploadFile(app.url);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("RECONNECT_REQUIRED");
  });

  it("507 with DRIVE_QUOTA_EXCEEDED when the backend surfaces a quota error", async () => {
    const { StorageOperationError } = await import("./storage/types");
    hoisted.fileFlow.uploadAndRegister.mockRejectedValueOnce(
      new StorageOperationError("gdrive" as any, "DRIVE_QUOTA_EXCEEDED: storage quota has been exceeded"),
    );
    const res = await uploadFile(app.url);
    expect(res.status).toBe(507);
    const body = await res.json();
    expect(body.code).toBe("DRIVE_QUOTA_EXCEEDED");
    expect(body.error.toLowerCase()).toContain("google drive is full");
  });

  it("502 when storage backend operation fails", async () => {
    hoisted.fileFlow.uploadAndRegister.mockResolvedValueOnce(undefined);
    const { StorageOperationError } = await import("./storage/types");
    hoisted.fileFlow.uploadAndRegister.mockReset();
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
