import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Local backend reads its base dir from app_settings first, then STORAGE_DIR.
// Mock app_settings to "unset" so the tests drive the dir purely via env.
vi.mock("../db/appSettings", () => ({
  getSetting: async () => null,
  setSetting: async () => {},
  deleteSetting: async () => {},
}));

import { localBackend, isLocalConfigured } from "./local";
import { StorageOperationError } from "./types";

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", c => chunks.push(Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

const meta = {
  ownerUserId: 7,
  propertyId: 1,
  originalName: "photo report.png",
  mimeType: "image/png",
};

describe("localBackend", () => {
  let baseDir: string;
  const snap = process.env.STORAGE_DIR;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), "hv-local-"));
    process.env.STORAGE_DIR = baseDir;
  });
  afterEach(() => {
    if (snap === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = snap;
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("round-trips an upload through download with correct bytes + size", async () => {
    const body = Buffer.from("hello homevault");
    const { externalId } = await localBackend.upload(body, meta);

    // Key is namespaced under the owner id and sanitises the filename.
    expect(externalId.startsWith("7/")).toBe(true);
    expect(externalId).not.toContain(" ");

    const result = await localBackend.download(externalId);
    expect(result.kind).toBe("stream");
    if (result.kind !== "stream") throw new Error("expected stream");
    expect(result.size).toBe(body.byteLength);
    const got = await streamToBuffer(result.stream);
    expect(got.equals(body)).toBe(true);
  });

  it("delete removes the file and is idempotent (ENOENT swallowed)", async () => {
    const { externalId } = await localBackend.upload(Buffer.from("x"), meta);
    const abs = path.join(baseDir, externalId);
    expect(existsSync(abs)).toBe(true);

    await localBackend.delete(externalId);
    expect(existsSync(abs)).toBe(false);
    // Second delete must not throw.
    await expect(localBackend.delete(externalId)).resolves.toBeUndefined();
  });

  it("rejects path traversal in externalId", async () => {
    await expect(localBackend.download("../escape")).rejects.toThrow(
      StorageOperationError
    );
    await expect(localBackend.delete("../../etc/passwd")).rejects.toThrow(
      StorageOperationError
    );
  });

  it("rejects NUL bytes in externalId", async () => {
    await expect(localBackend.download("a\0b")).rejects.toThrow(
      StorageOperationError
    );
  });

  it("download of a missing file throws StorageOperationError", async () => {
    await expect(localBackend.download("7/does-not-exist")).rejects.toThrow(
      StorageOperationError
    );
  });

  it("isLocalConfigured is true for a writable dir", async () => {
    expect(await isLocalConfigured()).toBe(true);
  });
});
