/**
 * Pure helpers for the hamburger-sidebar section-visibility preference.
 *
 * Kept free of React/DOM so the rules (what's hideable, how stored data is
 * parsed, how the nav is filtered) can be unit-tested in the node test env.
 *
 * Visibility is keyed by route **path** (e.g. "/loans") rather than the i18n
 * label key, because the two sidebar layouts (default `DashboardLayout` and the
 * opt-in `HomeVaultLayout`) use different label keys for the same pages
 * (nav.dashboard vs nav.today, nav.upgrades vs nav.projects). Paths are stable
 * across both, so a single stored preference drives both sidebars.
 */

/**
 * Routes the user can never hide from the sidebar. Settings must always be
 * reachable so the visibility controls themselves can't lock the user out of
 * the very page that manages them.
 */
export const ALWAYS_VISIBLE_NAV_PATHS = ["/settings"] as const;

const ALWAYS_VISIBLE_SET = new Set<string>(ALWAYS_VISIBLE_NAV_PATHS);

/** Whether a nav route is pinned on and cannot be toggled off. */
export function isNavPathLocked(path: string): boolean {
  return ALWAYS_VISIBLE_SET.has(path);
}

/**
 * Whether a nav route should appear, given the set of hidden paths. Locked
 * routes are always visible regardless of what's in the hidden set.
 */
export function isNavPathVisible(
  hidden: ReadonlySet<string>,
  path: string
): boolean {
  return ALWAYS_VISIBLE_SET.has(path) || !hidden.has(path);
}

/**
 * Parse the persisted hidden-paths payload. Tolerates missing/corrupt data and
 * non-string entries so a bad localStorage value can never crash the app —
 * worst case the sidebar falls back to showing everything.
 */
export function parseHiddenPaths(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

/** Compute the next hidden set after showing/hiding a path (locked paths ignored). */
export function nextHiddenSet(
  hidden: ReadonlySet<string>,
  path: string,
  visible: boolean
): Set<string> {
  const next = new Set(hidden);
  if (isNavPathLocked(path)) return next;
  if (visible) next.delete(path);
  else next.add(path);
  return next;
}

/**
 * Filter nav groups by route visibility, dropping any group left with no items
 * so empty section headers don't render.
 */
export function filterNavGroups<
  I extends { path: string },
  G extends { items: I[] },
>(groups: G[], isVisible: (path: string) => boolean): G[] {
  return groups
    .map(g => ({ ...g, items: g.items.filter(i => isVisible(i.path)) }))
    .filter(g => g.items.length > 0);
}
