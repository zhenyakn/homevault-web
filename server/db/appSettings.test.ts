import { describe, expect, it, vi, beforeEach } from "vitest";

// makeSettingCache is a pure-shape wrapper around get/setSetting; we exercise
// it with a hand-rolled fake for the underlying primitives. (The Drizzle path
// itself is best tested with a real MySQL — out of scope for unit tests.)

const store = new Map<string, string>();

vi.mock("./client", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onDuplicateKeyUpdate: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  }),
  parseJsonArray: (v: any) => (Array.isArray(v) ? v : []),
}));

import { getSetting, setSetting, deleteSetting, makeSettingCache } from "./appSettings";

describe("appSettings — module surface", () => {
  it("exports get/set/delete + makeSettingCache", () => {
    expect(typeof getSetting).toBe("function");
    expect(typeof setSetting).toBe("function");
    expect(typeof deleteSetting).toBe("function");
    expect(typeof makeSettingCache).toBe("function");
  });

  it("getSetting returns null for missing keys (via drizzle empty result)", async () => {
    expect(await getSetting("anything")).toBeNull();
  });

  it("setSetting + deleteSetting resolve without throwing against the mock", async () => {
    await expect(setSetting("k", "v")).resolves.toBeUndefined();
    await expect(deleteSetting("k")).resolves.toBeUndefined();
  });
});

describe("makeSettingCache — in-process caching semantics", () => {
  beforeEach(() => store.clear());

  it("caches the value after a get/set and clears it on clear()", async () => {
    const cache = makeSettingCache("k1");
    // First get: drives through the mocked getSetting (returns null).
    expect(await cache.get()).toBeNull();
    // set() stores it and primes the cache.
    await cache.set("hello");
    expect(await cache.get()).toBe("hello");
    // clear() resets to null
    await cache.clear();
    expect(await cache.get()).toBeNull();
  });

  it("invalidate() forces re-read on the next get()", async () => {
    const cache = makeSettingCache("k2");
    await cache.set("a");
    cache.invalidate();
    // Re-read consults the (mocked) underlying store, which always returns null
    expect(await cache.get()).toBeNull();
  });
});
