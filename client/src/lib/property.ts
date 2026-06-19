/**
 * Pure helpers for the property switcher UI.
 *
 * The switcher lives in three places (desktop sidebar, the mobile top bar, and
 * the hamburger sheet) and they all need the same "which property is active?"
 * resolution. Keeping it here makes the behaviour testable in the node test
 * environment (no DOM) and guarantees every surface agrees on the result.
 */

/** Minimal shape the switcher cares about — a subset of the API's Property. */
export interface PropertyLike {
  id: number;
  houseName?: string | null;
  address?: string | null;
}

/**
 * Resolve the property to treat as active.
 *
 * Mirrors the long-standing UI rule: prefer the property whose id matches the
 * stored `activePropertyId`; if that id isn't in the list (e.g. it was deleted,
 * or the list hasn't caught up), fall back to the first property so the UI never
 * renders an empty selection. Returns `undefined` only when there are no
 * properties at all.
 */
export function resolveActiveProperty<T extends PropertyLike>(
  properties: T[] | undefined | null,
  activePropertyId: number
): T | undefined {
  if (!properties || properties.length === 0) return undefined;
  return properties.find(p => p.id === activePropertyId) ?? properties[0];
}

/**
 * Display label for a property. Uses the house name when present (trimmed),
 * otherwise the provided fallback — so an unnamed or not-yet-loaded property
 * still shows something sensible instead of a blank pill.
 */
export function propertyDisplayName(
  property: PropertyLike | undefined | null,
  fallback: string
): string {
  const name = property?.houseName?.trim();
  return name && name.length > 0 ? name : fallback;
}
