import { describe, it, expect } from "vitest";
import {
  ALWAYS_VISIBLE_NAV_PATHS,
  isNavPathLocked,
  isNavPathVisible,
  parseHiddenPaths,
  nextHiddenSet,
  filterNavGroups,
} from "@/lib/sidebarPrefs";

describe("isNavPathLocked", () => {
  it("locks every always-visible path", () => {
    for (const path of ALWAYS_VISIBLE_NAV_PATHS) {
      expect(isNavPathLocked(path)).toBe(true);
    }
  });

  it("pins Settings so it can never be hidden", () => {
    // The whole point of the feature: Settings stays reachable.
    expect(isNavPathLocked("/settings")).toBe(true);
  });

  it("does not lock ordinary nav routes", () => {
    expect(isNavPathLocked("/loans")).toBe(false);
    expect(isNavPathLocked("/expenses")).toBe(false);
  });
});

describe("isNavPathVisible", () => {
  it("shows routes that are not in the hidden set", () => {
    expect(isNavPathVisible(new Set(), "/loans")).toBe(true);
    expect(isNavPathVisible(new Set(["/expenses"]), "/loans")).toBe(true);
  });

  it("hides routes present in the hidden set", () => {
    expect(isNavPathVisible(new Set(["/loans"]), "/loans")).toBe(false);
  });

  it("keeps locked routes visible even if they are in the hidden set", () => {
    expect(isNavPathVisible(new Set(["/settings"]), "/settings")).toBe(true);
  });
});

describe("parseHiddenPaths", () => {
  it("returns an empty list for missing/empty input", () => {
    expect(parseHiddenPaths(null)).toEqual([]);
    expect(parseHiddenPaths(undefined)).toEqual([]);
    expect(parseHiddenPaths("")).toEqual([]);
  });

  it("parses a valid JSON array of strings", () => {
    expect(parseHiddenPaths('["/loans","/wishlist"]')).toEqual([
      "/loans",
      "/wishlist",
    ]);
  });

  it("tolerates corrupt JSON without throwing", () => {
    expect(parseHiddenPaths("{not json")).toEqual([]);
  });

  it("drops non-string entries and non-array payloads", () => {
    expect(parseHiddenPaths('["/loans", 5, null, true]')).toEqual(["/loans"]);
    expect(parseHiddenPaths('{"a":1}')).toEqual([]);
    expect(parseHiddenPaths("42")).toEqual([]);
  });
});

describe("nextHiddenSet", () => {
  it("adds a path when hiding it", () => {
    const next = nextHiddenSet(new Set(), "/loans", false);
    expect([...next]).toEqual(["/loans"]);
  });

  it("removes a path when showing it", () => {
    const next = nextHiddenSet(new Set(["/loans"]), "/loans", true);
    expect([...next]).toEqual([]);
  });

  it("ignores attempts to hide a locked path", () => {
    const next = nextHiddenSet(new Set(), "/settings", false);
    expect(next.has("/settings")).toBe(false);
  });

  it("does not mutate the input set", () => {
    const original = new Set(["/loans"]);
    nextHiddenSet(original, "/wishlist", false);
    expect([...original]).toEqual(["/loans"]);
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

  it("removes hidden routes from their group", () => {
    const hidden = new Set(["/loans"]);
    const result = filterNavGroups(groups, p => isNavPathVisible(hidden, p));
    const finances = result.find(g => g.labelKey === "nav.group.finances");
    expect(finances?.items.map(i => i.path)).toEqual(["/expenses"]);
  });

  it("drops a group once all of its items are hidden", () => {
    const hidden = new Set(["/expenses", "/loans"]);
    const result = filterNavGroups(groups, p => isNavPathVisible(hidden, p));
    expect(result.map(g => g.labelKey)).toEqual(["nav.group.overview"]);
  });

  it("keeps a group containing a locked route even if its others are hidden", () => {
    const account = {
      labelKey: "nav.group.account",
      items: [
        { key: "nav.members", path: "/members" },
        { key: "nav.settings", path: "/settings" },
      ],
    };
    const hidden = new Set(["/members", "/settings"]);
    const result = filterNavGroups([account], p => isNavPathVisible(hidden, p));
    expect(result).toHaveLength(1);
    expect(result[0].items.map(i => i.path)).toEqual(["/settings"]);
  });

  it("leaves everything intact when nothing is hidden", () => {
    const result = filterNavGroups(groups, () => true);
    expect(result).toEqual(groups);
  });

  it("does not mutate the input groups", () => {
    const hidden = new Set(["/loans"]);
    filterNavGroups(groups, p => isNavPathVisible(hidden, p));
    expect(groups[1].items.map(i => i.path)).toEqual(["/expenses", "/loans"]);
  });
});
