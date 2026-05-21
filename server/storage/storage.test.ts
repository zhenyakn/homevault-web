import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getActiveBackend,
  getActiveBackendName,
  getBackendByName,
  StorageNotConfiguredError,
  s3Backend,
  gdriveBackend,
} from "./index";

// ─── Backend dispatcher ──────────────────────────────────────────────────────

describe("getActiveBackendName", () => {
  const snap = { ...process.env };
  beforeEach(() => {
    for (const k of [
      "STORAGE_BACKEND",
      "STORAGE_ENDPOINT",
      "STORAGE_BUCKET",
      "STORAGE_ACCESS_KEY_ID",
      "STORAGE_SECRET_ACCESS_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_OAUTH_REDIRECT_URI",
    ]) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    Object.assign(process.env, snap);
  });

  it("honors explicit STORAGE_BACKEND=gdrive", () => {
    process.env.STORAGE_BACKEND = "gdrive";
    expect(getActiveBackendName()).toBe("gdrive");
  });

  it("honors explicit STORAGE_BACKEND=s3", () => {
    process.env.STORAGE_BACKEND = "s3";
    expect(getActiveBackendName()).toBe("s3");
  });

  it("normalizes case", () => {
    process.env.STORAGE_BACKEND = "  GDRIVE  ";
    expect(getActiveBackendName()).toBe("gdrive");
  });

  it("auto-detects gdrive when Google env vars are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://x/cb";
    expect(getActiveBackendName()).toBe("gdrive");
  });

  it("auto-detects s3 when S3 env vars are present and Google's are not", () => {
    process.env.STORAGE_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.STORAGE_BUCKET = "bucket";
    process.env.STORAGE_ACCESS_KEY_ID = "ak";
    process.env.STORAGE_SECRET_ACCESS_KEY = "sk";
    expect(getActiveBackendName()).toBe("s3");
  });

  it("falls back to gdrive when nothing is configured", () => {
    expect(getActiveBackendName()).toBe("gdrive");
  });

  it("ignores invalid STORAGE_BACKEND values and auto-detects instead", () => {
    process.env.STORAGE_BACKEND = "ftp";
    process.env.STORAGE_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.STORAGE_BUCKET = "bucket";
    process.env.STORAGE_ACCESS_KEY_ID = "ak";
    process.env.STORAGE_SECRET_ACCESS_KEY = "sk";
    expect(getActiveBackendName()).toBe("s3");
  });
});

describe("getActiveBackend / getBackendByName", () => {
  it("returns the s3 backend instance", () => {
    process.env.STORAGE_BACKEND = "s3";
    const b = getActiveBackend();
    expect(b).toBe(s3Backend);
    expect(b.name).toBe("s3");
  });

  it("returns the gdrive backend instance", () => {
    process.env.STORAGE_BACKEND = "gdrive";
    expect(getActiveBackend()).toBe(gdriveBackend);
  });

  it("getBackendByName rejects unknown names with a StorageNotConfiguredError", () => {
    // @ts-expect-error – intentional bad name
    expect(() => getBackendByName("ftp")).toThrow(StorageNotConfiguredError);
  });

  it("getBackendByName returns the right backend by name", () => {
    expect(getBackendByName("s3")).toBe(s3Backend);
    expect(getBackendByName("gdrive")).toBe(gdriveBackend);
  });
});

// ─── S3 backend (config validation only — no network) ────────────────────────

describe("S3Backend.upload — not configured", () => {
  const snap = { ...process.env };
  beforeEach(() => {
    for (const k of [
      "STORAGE_ENDPOINT",
      "STORAGE_BUCKET",
      "STORAGE_ACCESS_KEY_ID",
      "STORAGE_SECRET_ACCESS_KEY",
    ]) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    Object.assign(process.env, snap);
  });

  it("throws StorageNotConfiguredError when env vars are missing", async () => {
    await expect(
      s3Backend.upload(Buffer.from("x"), {
        ownerUserId: 1,
        originalName: "x.txt",
        mimeType: "text/plain",
      })
    ).rejects.toThrow(StorageNotConfiguredError);
  });

  it("download throws StorageNotConfiguredError when env vars are missing", async () => {
    await expect(s3Backend.download("some-key")).rejects.toThrow(
      StorageNotConfiguredError
    );
  });
});
