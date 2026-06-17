import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * RTL regression guard (static).
 *
 * The app renders right-to-left in Hebrew (LanguageContext flips
 * `document.documentElement.dir`). Physical, direction-specific Tailwind
 * utilities (`ml/mr/pl/pr`, `text-left/right`, `left-N/right-N`) DON'T mirror,
 * so they silently break RTL — and the failure is invisible to the overflow
 * probe and to "did it crash" smoke tests (the bug renders fine, just on the
 * wrong side). The whole class is statically detectable, so we gate it here:
 * use LOGICAL utilities instead (`ms/me/ps/pe`, `text-start/end`,
 * `start-N/end-N`), or an explicit `ltr:`/`rtl:` variant when a physical value
 * really is intended per-direction.
 *
 * Scope: the app's own surface — `client/src/pages` and `client/src/components`
 * — EXCLUDING `client/src/components/ui`. Those are vendored shadcn primitives
 * (re-synced from upstream, full of legitimate `data-[side=…]`/direction-token
 * physical classes); their RTL correctness is covered by behavioural assertions
 * in `qa/tests/rtl/rtl-smoke.spec.ts` instead of by this lint.
 *
 * Not covered on purpose: `rounded-l/r-*` and `border-l/r-*` — frequently used
 * symmetrically (dividers, single-side borders) and low-signal here.
 */

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const SCAN_DIRS = ["client/src/pages", "client/src/components"];
const EXCLUDE_DIR = path.join("client", "src", "components", "ui");

// Each rule excludes tokens prefixed by an `ltr:`/`rtl:` variant (those are
// already direction-scoped and correct).
const RULES: Array<{ name: string; re: RegExp; fix: string }> = [
  {
    name: "text-left / text-right",
    re: /(?<![\w-])(?<!ltr:)(?<!rtl:)text-(left|right)(?![\w-])/g,
    fix: "use text-start / text-end",
  },
  {
    name: "physical margin / padding",
    re: /(?<![\w-])(?<!ltr:)(?<!rtl:)(ml|mr|pl|pr)-(auto|\d[\d.]*|\[)/g,
    fix: "use ms-/me-/ps-/pe-",
  },
  {
    name: "physical side positioning",
    re: /(?<![\w-])(?<!ltr:)(?<!rtl:)(left|right)-(0|0\.5|1|1\.5|2|2\.5|3|3\.5|4)(?![\w/.[])/g,
    fix: "use start-/end- (keep centering offsets like left-1/2 as-is)",
  },
];

/**
 * Known-good occurrences that are intentionally direction-aware. Keyed by a
 * substring of the offending line so it survives line-number churn. Keep this
 * list SMALL — a new entry should be rare and always explained.
 */
const ALLOWLIST: Array<{ file: string; contains: string; why: string }> = [
  {
    file: "client/src/components/DashboardLayout.tsx",
    contains: 'isRTL ? "left-0" : "right-0"',
    why: "resize handle pinned to the inline-end edge via an explicit isRTL ternary",
  },
  {
    file: "client/src/components/DashboardLayoutSkeleton.tsx",
    contains: "left-4 right-4",
    why: "symmetric full-width inset (both sides set) — direction-neutral",
  },
];

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const rel = path.join(dir, entry);
    if (path.join(ROOT, rel).startsWith(path.join(ROOT, EXCLUDE_DIR))) continue;
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) out.push(...walk(rel));
    else if (entry.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

function isAllowed(file: string, line: string): boolean {
  return ALLOWLIST.some(a => a.file === file && line.includes(a.contains));
}

describe("RTL: no physical direction utilities in app code", () => {
  it("uses logical Tailwind utilities (or ltr:/rtl: variants) everywhere", () => {
    const files = SCAN_DIRS.flatMap(walk);
    expect(files.length).toBeGreaterThan(0); // guard against a bad scan root

    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (isAllowed(file, line)) return;
        for (const { name, re, fix } of RULES) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line))) {
            violations.push(`${file}:${i + 1}  "${m[0]}" (${name}) → ${fix}`);
          }
        }
      });
    }

    expect(
      violations,
      `Physical RTL-breaking Tailwind utilities found. Replace with logical ` +
        `equivalents, or use an ltr:/rtl: variant if a per-direction physical ` +
        `value is truly intended:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });
});
