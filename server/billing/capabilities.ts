/**
 * Code-defined registry of product capabilities that can be gated behind plans.
 *
 * Each key here maps to a real enforcement point in the app (see `hasCapability`
 * call sites). The admin console assigns which plans include which capabilities,
 * but the *set of keys* lives in code — a key with no enforcement behind it
 * would do nothing, so capabilities aren't user-creatable.
 *
 * Gating only applies in SAAS mode; in standalone every capability is included
 * (single-install, un-metered), matching "free/included in standalone".
 */
export type CapabilityKey = "files.upload";

export type Capability = {
  key: CapabilityKey;
  label: string;
  description: string;
};

export const CAPABILITIES: readonly Capability[] = [
  {
    key: "files.upload",
    label: "File uploads",
    description: "Upload files and attach them to records (documents, photos).",
  },
] as const;

export function isCapabilityKey(key: string): key is CapabilityKey {
  return CAPABILITIES.some(c => c.key === key);
}

/** Filter an arbitrary key list down to the ones in the registry. */
export function sanitizeCapabilities(keys: unknown): CapabilityKey[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter(
    (k): k is CapabilityKey => typeof k === "string" && isCapabilityKey(k)
  );
}
