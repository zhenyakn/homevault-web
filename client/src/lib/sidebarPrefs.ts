/**
 * Pure helpers for the hamburger-sidebar section-visibility preference.
 *
 * Kept free of React/DOM so the rules (what's hideable, how stored data is
 * parsed, how the nav is filtered) can be unit-tested in the node test env.
 */

/**
 * Nav items the user can never hide from the sidebar. Settings must always be
 * reachable so the visibility controls themselves can't lock the user out of
 * the very page that manages them.
 */
export const ALWAYS_VISIBLE_NAV_KEYS = ["nav.settings"] as const;

const ALWAYS_VISIBLE_SET = new Set<string>(ALWAYS_VISIBLE_NAV_KEYS);

/** Whether a nav item is pinned on and cannot be toggled off. */
export function isNavKeyLocked(key: string): boolean {
  return ALWAYS_VISIBLE_SET.has(key);
}

/**
 * Whether a nav item should appear, given the set of hidden keys. Locked items
 * are always visible regardless of what's in the hidden set.
 */
export function isNavKeyVisible(
  hidden: ReadonlySet<string>,
  key: string
): boolean {
  return ALWAYS_VISIBLE_SET.has(key) || !hidden.has(key);
}

/**
 * Parse the persisted hidden-keys payload. Tolerates missing/corrupt data and
 * non-string entries so a bad localStorage value can never crash the app —
 * worst case the sidebar falls back to showing everything.
 */
export function parseHiddenKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

/** Compute the next hidden set after showing/hiding a key (locked keys ignored). */
export function nextHiddenSet(
  hidden: ReadonlySet<string>,
  key: string,
  visible: boolean
): Set<string> {
  const next = new Set(hidden);
  if (isNavKeyLocked(key)) return next;
  if (visible) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Filter nav groups by item visibility, dropping any group left with no items
 * so empty section headers don't render.
 */
export function filterNavGroups<
  I extends { key: string },
  G extends { items: I[] },
>(groups: G[], isVisible: (key: string) => boolean): G[] {
  return groups
    .map(g => ({ ...g, items: g.items.filter(i => isVisible(i.key)) }))
    .filter(g => g.items.length > 0);
}
