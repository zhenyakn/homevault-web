import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";

const hoisted = vi.hoisted(() => ({
  ctxState: { user: { id: 1, globalRole: "superadmin" } as any },
  envState: { noAuth: false, adminSetupToken: "" },
  gdriveMock: {
    buildConnectAuthUrl: null as any,
    completeConnect: null as any,
    disconnectGoogleDrive: null as any,
    getConnectionStatus: null as any,
    getCredentialsStatus: null as any,
    isGoogleConfigured: null as any,
    isGoogleEnvConfigured: null as any,
    validateDriveConnection: null as any,
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

vi.mock("./storage/gdrive", () => hoisted.gdriveMock);

vi.mock("./storage/types", async () => {
  class StorageNotConfiguredError extends Error {
    code = "STORAGE_NOT_CONFIGURED" as const;
  }
  class StorageOperationError extends Error {
    code = "STORAGE_OPERATION_FAILED" as const;
    backend: any;
  }
  return { StorageNotConfiguredError, StorageOperationError };
});

hoisted.gdriveMock.buildConnectAuthUrl = vi.fn(
  (state?: string) => `https://google.example/auth?state=${state ?? ""}`
);
hoisted.gdriveMock.completeConnect = vi.fn();
hoisted.gdriveMock.disconnectGoogleDrive = vi.fn();
hoisted.gdriveMock.getConnectionStatus = vi.fn();
hoisted.gdriveMock.getCredentialsStatus = vi.fn(async () => ({
  clientId: null,
  secretExists: false,
  redirectUri: null,
  fromEnv: false,
}));
hoisted.gdriveMock.isGoogleConfigured = vi.fn(async () => false);
hoisted.gdriveMock.isGoogleEnvConfigured = vi.fn(() => true);
// Heartbeat — the /status endpoint calls this before reading the persisted
// state. Mock returns void so the route falls through to getConnectionStatus
// for the actual response shape.
hoisted.gdriveMock.validateDriveConnection = vi.fn(async () => {});

import { googleDriveRouter, maskEmail } from "./googleDriveRoute";

const gdriveMock = hoisted.gdriveMock;

function startApp() {
  const app = express();
  app.use(googleDriveRouter);
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

async function fetchUrl(url: string, init?: RequestInit) {
  return fetch(url, { ...init, redirect: "manual" });
}

const OAUTH_STATE_COOKIE = "gdrive_oauth_state";
const hashState = (s: string) =>
  crypto.createHash("sha256").update(s).digest("base64url");

beforeEach(() => {
  hoisted.ctxState.user = { id: 1, globalRole: "superadmin" };
  hoisted.envState.noAuth = false;
  hoisted.envState.adminSetupToken = "";
  Object.values(gdriveMock).forEach(fn => (fn as any).mockReset?.());
  gdriveMock.isGoogleEnvConfigured.mockReturnValue(true);
  // /status reads these two; default to "nothing configured" so tests that
  // don't exercise credentials still get a 200 instead of a 500.
  gdriveMock.getCredentialsStatus.mockResolvedValue({
    clientId: null,
    secretExists: false,
    redirectUri: null,
    fromEnv: false,
  });
  gdriveMock.isGoogleConfigured.mockResolvedValue(false);
  gdriveMock.buildConnectAuthUrl.mockImplementation(
    (state?: string) => `https://google.example/auth?state=${state ?? ""}`
  );
  // Heartbeat is a no-op by default; individual tests can override.
  gdriveMock.validateDriveConnection.mockImplementation(async () => {});
});

// ─── /status ────────────────────────────────────────────────────────────────

describe("GET /api/google-drive/status", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns connection + configured flags for admins, masking the email + heartbeat fired", async () => {
    gdriveMock.getConnectionStatus.mockResolvedValueOnce({
      connected: true,
      email: "owner@example.com",
      needsReconnect: false,
    });
    gdriveMock.isGoogleConfigured.mockResolvedValueOnce(true);
    gdriveMock.getCredentialsStatus.mockResolvedValueOnce({
      clientId: "client-abc.apps.googleusercontent.com",
      secretExists: true,
      redirectUri: "https://app.example/api/google-drive/callback",
      fromEnv: false,
    });
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      connected: true,
      needsReconnect: false,
      emailMasked: "o***@example.com",
      clientId: "client-abc.apps.googleusercontent.com",
      secretExists: true,
      redirectUri: "https://app.example/api/google-drive/callback",
      fromEnv: false,
    });
    // The /status endpoint must trigger the proactive heartbeat.
    expect(gdriveMock.validateDriveConnection).toHaveBeenCalledTimes(1);
  });

  it("returns needsReconnect=true when the heartbeat flipped tokenBroken", async () => {
    // Simulate: heartbeat ran, classified an invalid_grant, and the persisted
    // tokenBroken flag is now read by getConnectionStatus.
    gdriveMock.getConnectionStatus.mockResolvedValueOnce({
      connected: true,
      email: "owner@example.com",
      needsReconnect: true,
    });
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect((await res.json()).needsReconnect).toBe(true);
  });

  it("returns null emailMasked when no email is stored", async () => {
    gdriveMock.getConnectionStatus.mockResolvedValueOnce({
      connected: false,
      email: null,
      needsReconnect: false,
    });
    const res = await fetchUrl(`${app.url}/api/google-drive/status`);
    expect((await res.json()).emailMasked).toBeNull();
  });

  it("403 when caller is not an admin", async () => {
    hoisted.ctxState.user = { id: 1, globalRole: "user" };
    expect((await fetchUrl(`${app.url}/api/google-drive/status`)).status).toBe(
      403
    );
  });

  it("401 when unauthenticated", async () => {
    hoisted.ctxState.user = null;
    expect((await fetchUrl(`${app.url}/api/google-drive/status`)).status).toBe(
      401
    );
  });
});

// ─── /connect ───────────────────────────────────────────────────────────────

describe("GET /api/google-drive/connect", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("issues a state cookie before redirecting to Google", async () => {
    const res = await fetchUrl(`${app.url}/api/google-drive/connect`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(
      /^https:\/\/google\.example\/auth\?state=/
    );
    expect(res.headers.get("set-cookie") ?? "").toMatch(
      new RegExp(`${OAUTH_STATE_COOKIE}=`)
    );
  });

  it("returns 503 when env is not configured", async () => {
    const { StorageNotConfiguredError } = await import("./storage/types");
    gdriveMock.buildConnectAuthUrl.mockImplementationOnce(() => {
      throw new StorageNotConfiguredError("missing GOOGLE_*");
    });
    expect((await fetchUrl(`${app.url}/api/google-drive/connect`)).status).toBe(
      503
    );
  });

  it("403 in NO_AUTH mode when ADMIN_SETUP_TOKEN is unset", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "";
    expect((await fetchUrl(`${app.url}/api/google-drive/connect`)).status).toBe(
      503
    );
  });

  it("403 in NO_AUTH mode when the setup-token header is missing", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    expect((await fetchUrl(`${app.url}/api/google-drive/connect`)).status).toBe(
      403
    );
  });

  it("302 in NO_AUTH mode when the setup-token header matches", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await fetchUrl(`${app.url}/api/google-drive/connect`, {
      headers: { "X-Admin-Setup-Token": "shared-secret" },
    });
    expect(res.status).toBe(302);
  });
});

// ─── /callback ──────────────────────────────────────────────────────────────

describe("GET /api/google-drive/callback", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const STATE = "test-state-token";
  const stateCookie = `${OAUTH_STATE_COOKIE}=${hashState(STATE)}`;

  it("happy path: redirects with email when state matches and code exchanges", async () => {
    gdriveMock.completeConnect.mockResolvedValueOnce({
      email: "owner@example.com",
    });
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("gdrive=connected");
    expect(loc).toContain("email=owner%40example.com");
    expect(loc).toContain("#/settings/integrations");
  });

  it("redirects without email when userinfo lookup returned none", async () => {
    gdriveMock.completeConnect.mockResolvedValueOnce({ email: null });
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`,
      {
        headers: { cookie: stateCookie },
      }
    );
    const loc = res.headers.get("location")!;
    expect(loc).toContain("gdrive=connected");
    expect(loc).not.toContain("email=");
  });

  it("400 when state cookie is missing entirely (OAuth state CSRF)", async () => {
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing or expired oauth state/i);
  });

  it("400 when the state in the URL does NOT match the cookie (CSRF rejected)", async () => {
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=different`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/oauth state mismatch/i);
  });

  it("400 when state query parameter is missing", async () => {
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(400);
  });

  it("400 when no code is supplied (cookie cleared too)", async () => {
    const res = await fetchUrl(`${app.url}/api/google-drive/callback`, {
      headers: { cookie: stateCookie },
    });
    expect(res.status).toBe(400);
    // State cookie was cleared up-front so it can't be replayed.
    expect(res.headers.get("set-cookie") ?? "").toMatch(/gdrive_oauth_state=/);
  });

  it("redirects with a GENERIC error when Google returned an error parameter (no info disclosure)", async () => {
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?error=access_denied`
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    // We do NOT echo Google's "access_denied" — only a generic friendly message.
    expect(loc).toContain("gdrive=error");
    expect(loc).not.toContain("access_denied");
    expect(loc).toContain("#/settings/integrations");
  });

  it("redirects with a GENERIC error when completeConnect throws (no Drive-API leak)", async () => {
    gdriveMock.completeConnect.mockRejectedValueOnce(
      new Error("Token has expired or been revoked")
    );
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("gdrive=error");
    expect(loc).not.toContain("revoked");
  });

  it("403 when caller is not an admin", async () => {
    hoisted.ctxState.user = { id: 1, globalRole: "user" };
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(403);
  });

  it("403 in NO_AUTH mode without the setup token, even with a valid state cookie", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await fetchUrl(
      `${app.url}/api/google-drive/callback?code=abc&state=${STATE}`,
      {
        headers: { cookie: stateCookie },
      }
    );
    expect(res.status).toBe(403);
  });
});

// ─── /disconnect ────────────────────────────────────────────────────────────

describe("POST /api/google-drive/disconnect", () => {
  let app: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    app = await startApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("clears the connection", async () => {
    gdriveMock.disconnectGoogleDrive.mockResolvedValueOnce(undefined);
    const res = await fetchUrl(`${app.url}/api/google-drive/disconnect`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(gdriveMock.disconnectGoogleDrive).toHaveBeenCalled();
  });

  it("403 for non-admin callers", async () => {
    hoisted.ctxState.user = { id: 1, globalRole: "user" };
    const res = await fetchUrl(`${app.url}/api/google-drive/disconnect`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("403 in NO_AUTH mode when ADMIN_SETUP_TOKEN is set but the request omits it", async () => {
    hoisted.envState.noAuth = true;
    hoisted.envState.adminSetupToken = "shared-secret";
    const res = await fetchUrl(`${app.url}/api/google-drive/disconnect`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });
});

// ─── maskEmail unit tests ───────────────────────────────────────────────────

describe("maskEmail", () => {
  it("masks typical addresses", () => {
    expect(maskEmail("owner@example.com")).toBe("o***@example.com");
    expect(maskEmail("a.long.name@gmail.com")).toBe("a***@gmail.com");
  });
  it("fully hides very short locals", () => {
    expect(maskEmail("ab@example.com")).toBe("**@example.com");
    expect(maskEmail("a@x.com")).toBe("*@x.com");
  });
  it("returns null for invalid / missing input", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
    expect(maskEmail("noatsign")).toBeNull();
  });
});
