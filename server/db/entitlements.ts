import { getAppMode } from "./admin";
import { getEffectivePlanKey } from "./billing";
import { getPlanByKey } from "./plans";
import type { CapabilityKey } from "../billing/capabilities";

/**
 * Whether a tenant is entitled to a capability.
 *
 * - Standalone mode: always true. A single-install deployment is un-metered, so
 *   every capability is included ("free/included in standalone").
 * - SAAS mode: true iff the tenant's effective plan lists the capability.
 *
 * Resolution is per-call (cheap: two indexed reads); callers gate features on it.
 */
export async function hasCapability(
  tenantId: number,
  capability: CapabilityKey
): Promise<boolean> {
  if ((await getAppMode()) !== "saas") return true;
  const planKey = await getEffectivePlanKey(tenantId);
  const plan = await getPlanByKey(planKey);
  const caps = (plan?.capabilities as string[] | null) ?? [];
  return caps.includes(capability);
}
