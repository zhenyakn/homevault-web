import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";

const hoisted = vi.hoisted(() => ({
  ctxState: { user: { id: 1, role: "admin" } as any },
  envState: { noAuth: false, adminSetupToken: "" },
  storageMock: {
    getStorageStatus: null as any,
    setActiveBackend: null as any,
    isBackendConfigured: null as any,
    testBackend: null as any,
    saveS3Config: null as any,
    saveLocalDir: null as any,
    testLocalWritable: null as any,
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

vi.mock("./_core/env", () => ({
  ENV: new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "noAuth") return hoisted.envState.noAuth;
        if (prop === "adminSetupToken") return hoisted.envState.adminSetupToken;
        if (prop === "isProduction") return false;
        return "";
      },
    }
  ),
}));

vi.mock("./storage", () => hoisted.storageMock);

import { storageRouter } from "./storageRoute";

const storageMock = hoisted.storageMock;

function startApp() {
  const app = express();
  app.use(express.json());
  app.use(storageRouter);
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

const DEFAULT_STATUS = {
  activeBackend: "local",
  source: "auto",
  backends: {
    gdrive: { configured: false },
    s3: {
      configured: false,
      endpoint: null,
      bucket: null,
      region: "auto",
      secretExists: false,
      fromEnv: false,
    },
    local: {
      configured: true,
      dir: "/data/uploads",
      fromEnv: false,
      writable: true,
    },
  },
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  hoisted.ctxState.user = { id: 1, role: "admin" };
  hoisted.envState.noAuth = false;
  hoisted.envState.adminSetupToken = "";
  storageMock.getStorageStatus = vi.fn(async () => DEFAULT_STATUS);
  storageMock.setActiveBackend = vi.fn(async () => {});
  storageMock.isBackendConfigured = vi.fn(async () => true);
  storageMock.testBackend = vi.fn(async () => ({ ok: true }));
  storageMock.saveS3Config = vi.fn(async () => {});
  storageMock.saveLocalDir = vi.fn(async () => {});
  storageMock.testLocalWritable = vi.fn(async () => ({
    ok: true,
    dir: "/tmp/x",
  }));
  app = await startApp();
});
afterEach(async () => {
  await app.close();
});

const post = (path: string, body?: any) =>
  fetch(`${app.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

// ─── /status ─────────────────────────────────────────────────────────────────

describe("GET /api/storage/status", () => {
  it("returns the aggregate status for admins", async () => {
    const res = await fetch(`${app.url}/api/storage/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeBackend).toBe("local");
    expect(body.backends.local.configured).toBe(true);
  });

  it("403 for non-admins", async () => {
    hoisted.ctxState.user = { id: 2, role: "user" };
    const res = await fetch(`${app.url}/api/storage/status`);
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    hoisted.ctxState.user = null;
    const res = await fetch(`${app.url}/api/storage/status`);
    expect(res.status).toBe(401);
  });
});

// ─── /active ─────────────────────────────────────────────────────────────────

describe("POST /api/storage/active", () => {
  it("sets a configured backend active", async () => {
    const res = await post("/api/storage/active", { backend: "local" });
    expect(res.status).toBe(200);
    expect(storageMock.setActiveBackend).toHaveBeenCalledWith("local");
  });

  it("rejects an unknown backend with 400", async () => {
    const res = await post("/api/storage/active", { backend: "ftp" });
    expect(res.status).toBe(400);
    expect(storageMock.setActiveBackend).not.toHaveBeenCalled();
  });

  it("rejects switching to an unconfigured backend", async () => {
    storageMock.isBackendConfigured = vi.fn(async () => false);
    const res = await post("/api/storage/active", { backend: "s3" });
    expect(res.status).toBe(400);
    expect(storageMock.setActiveBackend).not.toHaveBeenCalled();
  });

  it("allows switching to LOCAL in NO_AUTH without the setup token", async () => {
    // Local disk has no exfiltration vector, so it's gated by admin role only.
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/active", { backend: "local" });
    expect(res.status).toBe(200);
    expect(storageMock.setActiveBackend).toHaveBeenCalledWith("local");
  });

  it("403 switching to S3 in NO_AUTH without the setup token", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/active", { backend: "s3" });
    expect(res.status).toBe(403);
    expect(storageMock.setActiveBackend).not.toHaveBeenCalled();
  });

  it("allows switching to S3 in NO_AUTH with the correct setup token", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await fetch(`${app.url}/api/storage/active`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Setup-Token": "shared-secret",
      },
      body: JSON.stringify({ backend: "s3" }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── /s3 ─────────────────────────────────────────────────────────────────────

describe("POST /api/storage/s3", () => {
  const creds = {
    endpoint: "https://acc.r2.cloudflarestorage.com",
    bucket: "homevault",
    accessKeyId: "ak",
    secretAccessKey: "sk",
  };

  it("saves valid credentials", async () => {
    const res = await post("/api/storage/s3", creds);
    expect(res.status).toBe(200);
    expect(storageMock.saveS3Config).toHaveBeenCalled();
  });

  it("400 when required fields are missing", async () => {
    const res = await post("/api/storage/s3", { endpoint: "x" });
    expect(res.status).toBe(400);
    expect(storageMock.saveS3Config).not.toHaveBeenCalled();
  });

  it("400 when no secret on initial setup", async () => {
    const res = await post("/api/storage/s3", {
      endpoint: creds.endpoint,
      bucket: creds.bucket,
      accessKeyId: creds.accessKeyId,
    });
    expect(res.status).toBe(400);
  });

  it("403 in NO_AUTH without the setup token (external binding stays gated)", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/s3", creds);
    expect(res.status).toBe(403);
    expect(storageMock.saveS3Config).not.toHaveBeenCalled();
  });

  it("allows omitting the secret when one already exists", async () => {
    storageMock.getStorageStatus = vi.fn(async () => ({
      ...DEFAULT_STATUS,
      backends: {
        ...DEFAULT_STATUS.backends,
        s3: { ...DEFAULT_STATUS.backends.s3, secretExists: true },
      },
    }));
    const res = await post("/api/storage/s3", {
      endpoint: creds.endpoint,
      bucket: creds.bucket,
      accessKeyId: creds.accessKeyId,
    });
    expect(res.status).toBe(200);
  });
});

// ─── /local ──────────────────────────────────────────────────────────────────

describe("POST /api/storage/local", () => {
  it("saves a writable directory", async () => {
    const res = await post("/api/storage/local", { dir: "/data/uploads" });
    expect(res.status).toBe(200);
    expect(storageMock.saveLocalDir).toHaveBeenCalledWith("/data/uploads");
  });

  it("400 when the directory is not writable", async () => {
    storageMock.testLocalWritable = vi.fn(async () => ({
      ok: false,
      dir: "/root/x",
      error: "EACCES",
    }));
    const res = await post("/api/storage/local", { dir: "/root/x" });
    expect(res.status).toBe(400);
    expect(storageMock.saveLocalDir).not.toHaveBeenCalled();
  });

  it("400 when dir is missing", async () => {
    const res = await post("/api/storage/local", {});
    expect(res.status).toBe(400);
  });

  it("works in NO_AUTH without the setup token (local is admin-gated only)", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/local", { dir: "/data/uploads" });
    expect(res.status).toBe(200);
    expect(storageMock.saveLocalDir).toHaveBeenCalledWith("/data/uploads");
  });

  it("403 for non-admin callers", async () => {
    hoisted.ctxState.user = { id: 2, role: "user" };
    const res = await post("/api/storage/local", { dir: "/data/uploads" });
    expect(res.status).toBe(403);
  });
});

// ─── /test ───────────────────────────────────────────────────────────────────

describe("POST /api/storage/test", () => {
  it("runs the backend test and returns its result", async () => {
    storageMock.testBackend = vi.fn(async () => ({ ok: false, error: "nope" }));
    const res = await post("/api/storage/test", { backend: "s3" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "nope" });
    expect(storageMock.testBackend).toHaveBeenCalled();
  });

  it("400 for an unknown backend", async () => {
    const res = await post("/api/storage/test", { backend: "ftp" });
    expect(res.status).toBe(400);
  });

  it("tests LOCAL in NO_AUTH without the setup token", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/test", {
      backend: "local",
      dir: "/x",
    });
    expect(res.status).toBe(200);
    expect(storageMock.testBackend).toHaveBeenCalled();
  });

  it("403 testing S3 in NO_AUTH without the setup token", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await post("/api/storage/test", { backend: "s3" });
    expect(res.status).toBe(403);
  });
});
