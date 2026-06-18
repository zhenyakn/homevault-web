import { describe, it, expect } from "vitest";
import {
  ALWAYS_VISIBLE_NAV_KEYS,
  isNavKeyLocked,
  isNavKeyVisible,
  parseHiddenKeys,
  nextHiddenSet,
  filterNavGroups,
} from "@/lib/sidebarPrefs";

describe("isNavKeyLocked", () => {
  it("locks every always-visible key", () => {
    for (const key of ALWAYS_VISIBLE_NAV_KEYS) {
      expect(isNavKeyLocked(key)).toBe(true);
    }
  });

  it("pins Settings so it can never be hidden", () => {
    // The whole point of the feature: Settings stays reachable.
    expect(isNavKeyLocked("nav.settings")).toBe(true);
  });

  it("does not lock ordinary nav items", () => {
    expect(isNavKeyLocked("nav.loans")).toBe(false);
    expect(isNavKeyLocked("nav.expenses")).toBe(false);
  });
});

describe("isNavKeyVisible", () => {
  it("shows items that are not in the hidden set", () => {
    expect(isNavKeyVisible(new Set(), "nav.loans")).toBe(true);
    expect(isNavKeyVisible(new Set(["nav.expenses"]), "nav.loans")).toBe(true);
  });

  it("hides items present in the hidden set", () => {
    expect(isNavKeyVisible(new Set(["nav.loans"]), "nav.loans")).toBe(false);
  });

  it("keeps locked items visible even if they are in the hidden set", () => {
    expect(isNavKeyVisible(new Set(["nav.settings"]), "nav.settings")).toBe(
      true
    );
  });
});

describe("parseHiddenKeys", () => {
  it("returns an empty list for missing/empty input", () => {
    expect(parseHiddenKeys(null)).toEqual([]);
    expect(parseHiddenKeys(undefined)).toEqual([]);
    expect(parseHiddenKeys("")).toEqual([]);
  });

  it("parses a valid JSON array of strings", () => {
    expect(parseHiddenKeys('["nav.loans","nav.wishlist"]')).toEqual([
      "nav.loans",
      "nav.wishlist",
    ]);
  });

  it("tolerates corrupt JSON without throwing", () => {
    expect(parseHiddenKeys("{not json")).toEqual([]);
  });

  it("drops non-string entries and non-array payloads", () => {
    expect(parseHiddenKeys('["nav.loans", 5, null, true]')).toEqual([
      "nav.loans",
    ]);
    expect(parseHiddenKeys('{"a":1}')).toEqual([]);
    expect(parseHiddenKeys("42")).toEqual([]);
  });
});

describe("nextHiddenSet", () => {
  it("adds a key when hiding it", () => {
    const next = nextHiddenSet(new Set(), "nav.loans", false);
    expect([...next]).toEqual(["nav.loans"]);
  });

  it("removes a key when showing it", () => {
    const next = nextHiddenSet(new Set(["nav.loans"]), "nav.loans", true);
    expect([...next]).toEqual([]);
  });

  it("ignores attempts to hide a locked key", () => {
    const next = nextHiddenSet(new Set(), "nav.settings", false);
    expect(next.has("nav.settings")).toBe(false);
  });

  it("does not mutate the input set", () => {
    const original = new Set(["nav.loans"]);
    nextHiddenSet(original, "nav.wishlist", false);
    expect([...original]).toEqual(["nav.loans"]);
  });
});

describe("filterNavGroups", () => {
  const groups = [
    {
      labelKey: "nav.group.overview",
      items: [
        { key: "nav.dashboard", path: "/" },
        { key: "nav.calendar", path: "/calendar" },
      ],
    },
    {
      labelKey: "nav.group.finances",
      items: [
        { key: "nav.expenses", path: "/expenses" },
        { key: "nav.loans", path: "/loans" },
      ],
    },
  ];

  it("removes hidden items from their group", () => {
    const hidden = new Set(["nav.loans"]);
    const result = filterNavGroups(groups, k => isNavKeyVisible(hidden, k));
    const finances = result.find(g => g.labelKey === "nav.group.finances");
    expect(finances?.items.map(i => i.key)).toEqual(["nav.expenses"]);
  });

  it("drops a group once all of its items are hidden", () => {
    const hidden = new Set(["nav.expenses", "nav.loans"]);
    const result = filterNavGroups(groups, k => isNavKeyVisible(hidden, k));
    expect(result.map(g => g.labelKey)).toEqual(["nav.group.overview"]);
  });

  it("keeps a group containing a locked item even if its others are hidden", () => {
    const account = {
      labelKey: "nav.group.account",
      items: [
        { key: "nav.members", path: "/members" },
        { key: "nav.settings", path: "/settings" },
      ],
    };
    const hidden = new Set(["nav.members", "nav.settings"]);
    const result = filterNavGroups([account], k => isNavKeyVisible(hidden, k));
    expect(result).toHaveLength(1);
    expect(result[0].items.map(i => i.key)).toEqual(["nav.settings"]);
  });

  it("leaves everything intact when nothing is hidden", () => {
    const result = filterNavGroups(groups, () => true);
    expect(result).toEqual(groups);
  });

  it("does not mutate the input groups", () => {
    const hidden = new Set(["nav.loans"]);
    filterNavGroups(groups, k => isNavKeyVisible(hidden, k));
    expect(groups[1].items.map(i => i.key)).toEqual([
      "nav.expenses",
      "nav.loans",
    ]);
  });
});
