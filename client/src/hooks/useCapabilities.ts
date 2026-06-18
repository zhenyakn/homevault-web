import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Capability keys mirrored from server/billing/capabilities.ts. */
export type CapabilityKey =
  | "files.upload"
  | "apartment.search"
  | "data.export"
  | "notifications.telegram"
  | "notifications.whatsapp";

/**
 * App-wide feature entitlements for the active tenant. Backed by a single
 * cached query (billing.capabilities) so gating is cheap everywhere.
 *
 * While the query is in flight `has()` is optimistic (returns true) to avoid a
 * lock flicker — the server still enforces every gated action, so an optimistic
 * client can't actually bypass anything.
 */
export function useCapabilities() {
  const q = trpc.billing.capabilities.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const caps = q.data?.capabilities as CapabilityKey[] | undefined;
  const has = (cap: CapabilityKey): boolean =>
    caps == null ? true : caps.includes(cap);
  // Billing/plan surfaces only make sense in hosted (SAAS) mode. Default false
  // until loaded so single-install (standalone) deployments never flash them.
  const isSaas = q.data?.isSaas === true;
  return { has, isSaas, loaded: caps != null, isLoading: q.isLoading };
}

/**
 * Returns a guard for click handlers: if the capability is missing it nudges
 * the user to the Plan page (toast + navigate) and returns true ("blocked").
 * Use as: `onClick={() => { if (guard("data.export", label)) return; doExport(); }}`
 */
export function useFeatureGuard() {
  const { has } = useCapabilities();
  const [, navigate] = useLocation();
  return (cap: CapabilityKey, featureLabel?: string): boolean => {
    if (has(cap)) return false;
    toast.error(
      featureLabel
        ? `${featureLabel} isn't included in your plan.`
        : "This feature isn't included in your plan.",
      { action: { label: "Upgrade", onClick: () => navigate("/plan") } }
    );
    return true;
  };
}
