import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "stream";

// Hoisted state — vi.hoisted() lets us share mutable mock state between
// vi.mock factories (hoisted to top of file) and the test bodies below.
const hoisted = vi.hoisted(() => {
  const fakeSettings = new Map<string, string>();

  const driveStub = {
    files: {
      list: (globalThis as any).vi ? (globalThis as any).vi.fn() : null,
      create: null as any,
      get: null as any,
      delete: null as any,
    },
  };
  const oauth2userinfoStub = { userinfo: { get: null as any } };

  class FakeOAuth2 {
    credentials: any = {};
    constructor(_opts: any) {}
    setCredentials(c: any) { this.credentials = c; }
    on() {}
    generateAuthUrl(opts: any) {
      const scopes = Array.isArray(opts.scope) ? opts.scope.join(" ") : opts.scope;
      return `https://accounts.google.com/o/oauth2/v2/auth?scope=${encodeURIComponent(scopes)}&prompt=${opts.prompt}`;
    }
    getToken(code: string) {
      if (code === "no-refresh") return Promise.resolve({ tokens: { access_token: "x" } });
      return Promise.resolve({ tokens: { refresh_token: "rt-" + code, access_token: "at-" + code } });
    }
  }

  return { fakeSettings, driveStub, oauth2userinfoStub, FakeOAuth2 };
});

vi.mock("../db/appSettings", () => ({
  getSetting: async (k: string) => hoisted.fakeSettings.get(k) ?? null,
  setSetting: async (k: string, v: string) => { hoisted.fakeSettings.set(k, v); },
  deleteSetting: async (k: string) => { hoisted.fakeSettings.delete(k); },
  makeSettingCache: (k: string) => ({
    get: async () => hoisted.fakeSettings.get(k) ?? null,
    set: async (v: string) => { hoisted.fakeSettings.set(k, v); },
    clear: async () => { hoisted.fakeSettings.delete(k); },
    invalidate: () => {},
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: hoisted.FakeOAuth2 },
    drive: () => hoisted.driveStub,
    oauth2: () => hoisted.oauth2userinfoStub,
  },
}));

// Now we can replace the placeholder `null`s with real vi.fn() since vitest
// is fully loaded.
hoisted.driveStub.files.list = vi.fn();
hoisted.driveStub.files.create = vi.fn();
hoisted.driveStub.files.get = vi.fn();
hoisted.driveStub.files.delete = vi.fn();
hoisted.oauth2userinfoStub.userinfo.get = vi.fn();

import {
  GDRIVE_KEYS,
  buildConnectAuthUrl,
  completeConnect,
  disconnectGoogleDrive,
  getConnectionStatus,
  gdriveBackend,
  isGoogleEnvConfigured,
  _resetGoogleDriveCachesForTests,
} from "./gdrive";
import { StorageNotConfiguredError, StorageOperationError } from "./types";
import { readMaybeEncrypted, encryptSecret } from "../_core/secrets";

// Helper: stored values are now AES-GCM envelopes. Tests assert against the
// decrypted plaintext, not the raw envelope (which has a random nonce).
const stored = (k: string) => readMaybeEncrypted(fakeSettings.get(k) ?? null);
// Helper to seed a value the way production code would (encrypted).
const seedEncrypted = (k: string, v: string) => fakeSettings.set(k, encryptSecret(v));

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"];
const ENV_SNAP: Record<string, string | undefined> = {};
const fakeSettings = hoisted.fakeSettings;
const driveStub = hoisted.driveStub;
const oauth2userinfoStub = hoisted.oauth2userinfoStub;

beforeEach(async () => {
  for (const k of ENV_KEYS) ENV_SNAP[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "id";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost/cb";
  fakeSettings.clear();
  driveStub.files.list.mockReset();
  driveStub.files.create.mockReset();
  driveStub.files.get.mockReset();
  driveStub.files.delete.mockReset();
  oauth2userinfoStub.userinfo.get.mockReset();
  await _resetGoogleDriveCachesForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ENV_SNAP[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_SNAP[k]!;
  }
});

// ─── Env / OAuth URL generation ──────────────────────────────────────────────

describe("isGoogleEnvConfigured", () => {
  it("returns true with all three vars set", () => {
    expect(isGoogleEnvConfigured()).toBe(true);
  });
  it("returns false when one var is missing", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isGoogleEnvConfigured()).toBe(false);
  });
});

describe("buildConnectAuthUrl", () => {
  it("requests the least-privilege drive.file scope with prompt=consent", () => {
    const url = buildConnectAuthUrl();
    expect(url).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file");
    expect(url).toContain("prompt=consent");
  });

  it("throws StorageNotConfiguredError when env vars are missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => buildConnectAuthUrl()).toThrow(StorageNotConfiguredError);
  });
});

// ─── completeConnect ─────────────────────────────────────────────────────────

describe("completeConnect", () => {
  it("persists refresh_token + email on a successful exchange", async () => {
    oauth2userinfoStub.userinfo.get.mockResolvedValueOnce({
      data: { email: "owner@example.com" },
    });
    const { email } = await completeConnect("good-code");
    expect(email).toBe("owner@example.com");
    // Persisted as an AES-GCM envelope (M1 hardening) — never plaintext.
    expect(fakeSettings.get(GDRIVE_KEYS.refreshToken)!.startsWith("v1:")).toBe(true);
    expect(stored(GDRIVE_KEYS.refreshToken)).toBe("rt-good-code");
    expect(stored(GDRIVE_KEYS.connectedEmail)).toBe("owner@example.com");
  });

  it("throws StorageOperationError when Google does not return a refresh_token", async () => {
    await expect(completeConnect("no-refresh")).rejects.toThrow(StorageOperationError);
    expect(fakeSettings.has(GDRIVE_KEYS.refreshToken)).toBe(false);
  });

  it("still persists the refresh token if userinfo lookup fails", async () => {
    oauth2userinfoStub.userinfo.get.mockRejectedValueOnce(new Error("403"));
    const { email } = await completeConnect("good-code");
    expect(email).toBeNull();
    expect(stored(GDRIVE_KEYS.refreshToken)).toBe("rt-good-code");
  });
});

// ─── disconnectGoogleDrive + getConnectionStatus ─────────────────────────────

describe("disconnect + status", () => {
  it("getConnectionStatus reports disconnected by default", async () => {
    expect(await getConnectionStatus()).toEqual({ connected: false, email: null });
  });

  it("getConnectionStatus reports connected after a token is stored", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    fakeSettings.set(GDRIVE_KEYS.connectedEmail, "owner@example.com");
    expect(await getConnectionStatus()).toEqual({
      connected: true,
      email: "owner@example.com",
    });
  });

  it("disconnectGoogleDrive clears every gdrive.* key", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    fakeSettings.set(GDRIVE_KEYS.connectedEmail, "owner@example.com");
    fakeSettings.set(GDRIVE_KEYS.rootFolderId, "root");
    await disconnectGoogleDrive();
    expect(await getConnectionStatus()).toEqual({ connected: false, email: null });
    expect(fakeSettings.has(GDRIVE_KEYS.rootFolderId)).toBe(false);
  });
});

// ─── gdriveBackend.upload ────────────────────────────────────────────────────

describe("gdriveBackend.upload", () => {
  it("throws StorageNotConfiguredError when not connected", async () => {
    await expect(
      gdriveBackend.upload(Buffer.from("x"), { ownerUserId: 1, originalName: "x.pdf", mimeType: "application/pdf" }),
    ).rejects.toThrow(StorageNotConfiguredError);
  });

  it("creates the HomeVault > uploads > <userId> folder chain on first call", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    driveStub.files.list.mockResolvedValue({ data: { files: [] } });
    driveStub.files.create
      .mockResolvedValueOnce({ data: { id: "root-fid" } })
      .mockResolvedValueOnce({ data: { id: "uploads-fid" } })
      .mockResolvedValueOnce({ data: { id: "user-fid" } })
      .mockResolvedValueOnce({ data: { id: "drive-file-id" } });

    const result = await gdriveBackend.upload(Buffer.from("data"), {
      ownerUserId: 42,
      originalName: "receipt.pdf",
      mimeType: "application/pdf",
    });

    expect(result).toEqual({ externalId: "drive-file-id" });
    expect(driveStub.files.create).toHaveBeenCalledTimes(4);

    const lastCall = driveStub.files.create.mock.calls.at(-1)![0];
    expect(lastCall.requestBody).toMatchObject({
      name: "receipt.pdf",
      parents: ["user-fid"],
    });
    expect(lastCall.media.mimeType).toBe("application/pdf");
    expect(lastCall.media.body).toBeInstanceOf(Readable);

    // Folder IDs are encrypted at rest (M1) — read through the helper.
    expect(stored(GDRIVE_KEYS.rootFolderId)).toBe("root-fid");
    expect(stored(GDRIVE_KEYS.userFolderPrefix + "42")).toBe("user-fid");
  });

  it("reuses cached folder ids on subsequent uploads (no listing)", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    fakeSettings.set(GDRIVE_KEYS.rootFolderId, "root-fid");
    fakeSettings.set(GDRIVE_KEYS.userFolderPrefix + "_uploads", "uploads-fid");
    fakeSettings.set(GDRIVE_KEYS.userFolderPrefix + "42", "user-fid");

    driveStub.files.create.mockResolvedValueOnce({ data: { id: "drive-file-id" } });

    await gdriveBackend.upload(Buffer.from("data"), {
      ownerUserId: 42,
      originalName: "x.pdf",
      mimeType: "application/pdf",
    });

    expect(driveStub.files.list).not.toHaveBeenCalled();
    expect(driveStub.files.create).toHaveBeenCalledTimes(1);
  });

  it("wraps Drive upload failures as StorageOperationError", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    fakeSettings.set(GDRIVE_KEYS.rootFolderId, "root-fid");
    fakeSettings.set(GDRIVE_KEYS.userFolderPrefix + "_uploads", "uploads-fid");
    fakeSettings.set(GDRIVE_KEYS.userFolderPrefix + "1", "user-fid");
    driveStub.files.create.mockRejectedValueOnce(new Error("403 forbidden"));

    await expect(
      gdriveBackend.upload(Buffer.from("x"), {
        ownerUserId: 1,
        originalName: "x.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(StorageOperationError);
  });
});

// ─── gdriveBackend.download ──────────────────────────────────────────────────

describe("gdriveBackend.download", () => {
  beforeEach(() => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
  });

  it("returns a stream + mimeType from Drive metadata", async () => {
    driveStub.files.get
      .mockResolvedValueOnce({
        data: { id: "did", mimeType: "image/png", size: "1234", trashed: false },
      })
      .mockResolvedValueOnce({
        data: Readable.from(Buffer.from("png-bytes")),
      });

    const result = await gdriveBackend.download("did");
    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(result.mimeType).toBe("image/png");
      expect(result.size).toBe(1234);
      expect(result.stream).toBeDefined();
    }
  });

  it("rejects trashed files", async () => {
    driveStub.files.get.mockResolvedValueOnce({
      data: { id: "did", mimeType: "image/png", size: "0", trashed: true },
    });
    await expect(gdriveBackend.download("did")).rejects.toThrow(StorageOperationError);
  });

  it("wraps Drive errors with StorageOperationError", async () => {
    driveStub.files.get.mockRejectedValueOnce(new Error("404"));
    await expect(gdriveBackend.download("did")).rejects.toThrow(StorageOperationError);
  });
});

// ─── gdriveBackend.delete ────────────────────────────────────────────────────

describe("gdriveBackend.delete", () => {
  beforeEach(() => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
  });

  it("calls Drive delete", async () => {
    driveStub.files.delete.mockResolvedValueOnce({});
    await gdriveBackend.delete("did");
    expect(driveStub.files.delete).toHaveBeenCalledWith({ fileId: "did" });
  });

  it("swallows 404 (already gone)", async () => {
    const err: any = new Error("not found");
    err.code = 404;
    driveStub.files.delete.mockRejectedValueOnce(err);
    await expect(gdriveBackend.delete("did")).resolves.toBeUndefined();
  });

  it("wraps non-404 errors as StorageOperationError", async () => {
    driveStub.files.delete.mockRejectedValueOnce(new Error("500"));
    await expect(gdriveBackend.delete("did")).rejects.toThrow(StorageOperationError);
  });
});

// ─── ensureFolder lookup-first semantics ─────────────────────────────────────

describe("folder lookup uses existing folder when present", () => {
  it("does not create a folder if list returns one", async () => {
    fakeSettings.set(GDRIVE_KEYS.refreshToken, "rt");
    driveStub.files.list
      .mockResolvedValueOnce({ data: { files: [{ id: "root-fid", name: "HomeVault" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "uploads-fid", name: "uploads" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "user-fid", name: "1" }] } });
    driveStub.files.create.mockResolvedValueOnce({ data: { id: "drive-file-id" } });

    await gdriveBackend.upload(Buffer.from("x"), {
      ownerUserId: 1,
      originalName: "a.pdf",
      mimeType: "application/pdf",
    });

    expect(driveStub.files.list).toHaveBeenCalledTimes(3);
    expect(driveStub.files.create).toHaveBeenCalledTimes(1);
  });
});
