import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the storage backends + db before importing files.ts — `vi.mock` is
// hoisted so the module-under-test sees the mocked dependencies.
vi.mock("./storage", () => {
  const upload = vi.fn();
  const del = vi.fn();
  const download = vi.fn();
  const backend = { name: "gdrive" as const, upload, download, delete: del };
  return {
    getActiveBackend: () => backend,
    getBackendByName: () => backend,
    s3Backend: backend,
    gdriveBackend: backend,
    StorageNotConfiguredError: class extends Error {},
    StorageOperationError: class extends Error {},
    __mockBackend: backend,
  };
});

vi.mock("./db/client", async () => {
  const fakeRows: any[] = [];
  const updated: any[] = [];
  const inserted: any[] = [];
  const deleted: any[] = [];

  // Tiny query-builder mock that returns chainable thenables — drizzle calls
  // .from(...).where(...).limit(...) → we just need the final value to match.
  function makeSelect() {
    let _selected: any = undefined;
    return {
      from() { return this; },
      where(_w: any) { _selected = fakeRows.shift(); return this; },
      limit() { return Promise.resolve(_selected ? [_selected] : []); },
    };
  }
  const db = {
    select: () => makeSelect(),
    insert: () => ({ values: (v: any) => { inserted.push(v); return Promise.resolve(); } }),
    update: () => ({ set: (s: any) => ({ where: (_w: any) => { updated.push(s); return Promise.resolve(); } }) }),
    delete: () => ({ where: (_w: any) => { deleted.push(true); return Promise.resolve(); } }),
  };
  return {
    getDb: async () => db,
    parseJsonArray: (v: any) => (Array.isArray(v) ? v : []),
    __setRows: (rows: any[]) => { fakeRows.length = 0; fakeRows.push(...rows); },
    __getUpdated: () => updated,
    __getInserted: () => inserted,
    __getDeleted: () => deleted,
    __reset: () => { fakeRows.length = 0; updated.length = 0; inserted.length = 0; deleted.length = 0; },
  };
});

import {
  buildProxyUrl,
  parseProxyUrl,
  syncAttachmentRemovals,
  deleteAttachmentList,
  uploadAndRegister,
  deleteFileForOwner,
} from "./files";

// Pull internals via the same mocks (after vi.mock so they're the mocked versions)
import * as storage from "./storage";
import * as client from "./db/client";

const mockBackend = (storage as any).__mockBackend;

describe("buildProxyUrl / parseProxyUrl", () => {
  it("round-trips a file id", () => {
    const url = buildProxyUrl("abc12345_X", "receipt.pdf");
    expect(url).toBe("/api/files/abc12345_X/receipt.pdf");
    expect(parseProxyUrl(url)).toEqual({ id: "abc12345_X" });
  });

  it("URL-encodes the original filename", () => {
    const url = buildProxyUrl("abc12345", "weird name (1).pdf");
    expect(url).toBe("/api/files/abc12345/weird%20name%20(1).pdf");
  });

  it("parses URLs without a filename suffix", () => {
    expect(parseProxyUrl("/api/files/abc12345")).toEqual({ id: "abc12345" });
  });

  it("strips query strings when parsing", () => {
    expect(parseProxyUrl("/api/files/abc12345/x.pdf?cb=1")).toEqual({ id: "abc12345" });
  });

  it("returns null for legacy https:// URLs", () => {
    expect(parseProxyUrl("https://pub-x.r2.dev/uploads/1/file.pdf")).toBeNull();
  });

  it("returns null for arbitrary text", () => {
    expect(parseProxyUrl("hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseProxyUrl("")).toBeNull();
  });

  it("rejects suspicious file ids (e.g. dots / slashes)", () => {
    expect(parseProxyUrl("/api/files/../etc/passwd")).toBeNull();
    expect(parseProxyUrl("/api/files/short")).toBeNull(); // < 8 chars
  });
});

// ─── deleteFileForOwner ──────────────────────────────────────────────────────

describe("deleteFileForOwner", () => {
  beforeEach(() => {
    (client as any).__reset();
    mockBackend.upload.mockReset();
    mockBackend.delete.mockReset();
    mockBackend.download.mockReset();
  });

  it("soft-deletes the row and calls the backend", async () => {
    (client as any).__setRows([
      {
        id: "fid1",
        backend: "gdrive",
        externalId: "ext1",
        originalName: "x.pdf",
        mimeType: "application/pdf",
        size: 10,
        ownerUserId: 7,
        createdAt: new Date(),
        deletedAt: null,
      },
    ]);
    mockBackend.delete.mockResolvedValueOnce(undefined);
    const result = await deleteFileForOwner("fid1", 7);
    expect(result.deleted).toBe(true);
    expect(result.backendError).toBeUndefined();
    expect(mockBackend.delete).toHaveBeenCalledWith("ext1");
    expect((client as any).__getUpdated()[0]).toHaveProperty("deletedAt");
  });

  it("returns deleted:false when row is missing", async () => {
    (client as any).__setRows([]);
    const result = await deleteFileForOwner("missing", 7);
    expect(result.deleted).toBe(false);
    expect(mockBackend.delete).not.toHaveBeenCalled();
  });

  it("swallows backend errors but still returns deleted:true", async () => {
    (client as any).__setRows([
      {
        id: "fid1",
        backend: "gdrive",
        externalId: "ext1",
        originalName: "x.pdf",
        mimeType: "application/pdf",
        size: 10,
        ownerUserId: 7,
        createdAt: new Date(),
        deletedAt: null,
      },
    ]);
    mockBackend.delete.mockRejectedValueOnce(new Error("Drive offline"));
    const result = await deleteFileForOwner("fid1", 7);
    expect(result.deleted).toBe(true);
    expect(result.backendError).toContain("Drive offline");
  });
});

// ─── syncAttachmentRemovals ──────────────────────────────────────────────────

describe("syncAttachmentRemovals", () => {
  beforeEach(() => {
    (client as any).__reset();
    mockBackend.delete.mockReset();
  });

  it("no-ops when newList is undefined (field absent from update)", async () => {
    const result = await syncAttachmentRemovals({
      oldList: ["/api/files/abc12345/a.pdf"],
      newList: undefined,
      ownerUserId: 1,
    });
    expect(result).toEqual({ removed: 0, errors: 0 });
  });

  it("does not delete entries still present in newList", async () => {
    const url = "/api/files/abc12345/a.pdf";
    const result = await syncAttachmentRemovals({
      oldList: [url],
      newList: [url],
      ownerUserId: 1,
    });
    expect(result).toEqual({ removed: 0, errors: 0 });
    expect(mockBackend.delete).not.toHaveBeenCalled();
  });

  it("deletes proxy-URL entries that were removed", async () => {
    (client as any).__setRows([
      {
        id: "abc12345",
        backend: "gdrive",
        externalId: "drive-id",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        size: 1,
        ownerUserId: 1,
        createdAt: new Date(),
        deletedAt: null,
      },
    ]);
    mockBackend.delete.mockResolvedValueOnce(undefined);
    const result = await syncAttachmentRemovals({
      oldList: ["/api/files/abc12345/a.pdf"],
      newList: [],
      ownerUserId: 1,
    });
    expect(result.removed).toBe(1);
    expect(mockBackend.delete).toHaveBeenCalledWith("drive-id");
  });

  it("ignores legacy https:// URLs (never our files)", async () => {
    const result = await syncAttachmentRemovals({
      oldList: ["https://pub-x.r2.dev/old/file.pdf"],
      newList: [],
      ownerUserId: 1,
    });
    expect(result.removed).toBe(0);
    expect(mockBackend.delete).not.toHaveBeenCalled();
  });

  it("handles a mix of legacy + managed entries; deletes only managed ones", async () => {
    (client as any).__setRows([
      {
        id: "abc12345",
        backend: "gdrive",
        externalId: "drive-id",
        originalName: "a.pdf",
        mimeType: "application/pdf",
        size: 1,
        ownerUserId: 1,
        createdAt: new Date(),
        deletedAt: null,
      },
    ]);
    mockBackend.delete.mockResolvedValueOnce(undefined);
    const result = await syncAttachmentRemovals({
      oldList: ["https://legacy.com/x.pdf", "/api/files/abc12345/a.pdf"],
      newList: [],
      ownerUserId: 1,
    });
    expect(result.removed).toBe(1);
    expect(mockBackend.delete).toHaveBeenCalledTimes(1);
  });

  it("dedupes duplicate entries in oldList so each id is processed once", async () => {
    (client as any).__setRows([
      { id: "abc12345", backend: "gdrive", externalId: "ext1", originalName: "a.pdf", mimeType: "application/pdf", size: 1, ownerUserId: 1, createdAt: new Date(), deletedAt: null },
    ]);
    mockBackend.delete.mockResolvedValueOnce(undefined);
    const result = await syncAttachmentRemovals({
      oldList: ["/api/files/abc12345/a.pdf", "/api/files/abc12345/a.pdf"],
      newList: [],
      ownerUserId: 1,
    });
    expect(result.removed).toBe(1);
  });

  it("reports backend errors via the errors counter but still returns deleted=true", async () => {
    (client as any).__setRows([
      { id: "abc12345", backend: "gdrive", externalId: "ext1", originalName: "a.pdf", mimeType: "application/pdf", size: 1, ownerUserId: 1, createdAt: new Date(), deletedAt: null },
    ]);
    mockBackend.delete.mockRejectedValueOnce(new Error("Quota exceeded"));
    const result = await syncAttachmentRemovals({
      oldList: ["/api/files/abc12345/a.pdf"],
      newList: [],
      ownerUserId: 1,
    });
    expect(result.removed).toBe(1);
    expect(result.errors).toBe(1);
  });
});

// ─── deleteAttachmentList ────────────────────────────────────────────────────

describe("deleteAttachmentList", () => {
  beforeEach(() => {
    (client as any).__reset();
    mockBackend.delete.mockReset();
  });

  it("deletes every managed entry", async () => {
    (client as any).__setRows([
      { id: "abc12345", backend: "gdrive", externalId: "e1", originalName: "a", mimeType: "a/b", size: 0, ownerUserId: 1, createdAt: new Date(), deletedAt: null },
      { id: "def67890", backend: "gdrive", externalId: "e2", originalName: "b", mimeType: "a/b", size: 0, ownerUserId: 1, createdAt: new Date(), deletedAt: null },
    ]);
    mockBackend.delete.mockResolvedValue(undefined);
    const result = await deleteAttachmentList(
      ["/api/files/abc12345", "/api/files/def67890"],
      1,
    );
    expect(result.removed).toBe(2);
  });

  it("handles null/empty list", async () => {
    expect(await deleteAttachmentList(null, 1)).toEqual({ removed: 0, errors: 0 });
    expect(await deleteAttachmentList([], 1)).toEqual({ removed: 0, errors: 0 });
  });
});

// ─── uploadAndRegister ───────────────────────────────────────────────────────

describe("uploadAndRegister", () => {
  beforeEach(() => {
    (client as any).__reset();
    mockBackend.upload.mockReset();
  });

  it("uploads to the backend, inserts a files row, and returns a proxy URL", async () => {
    mockBackend.upload.mockResolvedValueOnce({ externalId: "drive-xyz" });
    const result = await uploadAndRegister({
      buffer: Buffer.from("hello"),
      originalName: "hi.txt",
      mimeType: "text/plain",
      ownerUserId: 42,
    });
    expect(mockBackend.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      { ownerUserId: 42, originalName: "hi.txt", mimeType: "text/plain" },
    );
    expect(result.record.externalId).toBe("drive-xyz");
    expect(result.record.size).toBe(5);
    expect(result.record.ownerUserId).toBe(42);
    expect(result.url).toBe(`/api/files/${result.record.id}/hi.txt`);
  });

  it("propagates backend upload errors so the route can convert them to HTTP responses", async () => {
    mockBackend.upload.mockRejectedValueOnce(new Error("Drive 401"));
    await expect(
      uploadAndRegister({
        buffer: Buffer.from("x"),
        originalName: "x",
        mimeType: "text/plain",
        ownerUserId: 1,
      }),
    ).rejects.toThrow("Drive 401");
  });
});
