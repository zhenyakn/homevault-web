import { getAppMode } from "./admin";
import { getEffectivePlanKey } from "./billing";
import { getPlanByKey } from "./plans";
import { CAPABILITIES, type CapabilityKey } from "../billing/capabilities";

/**
 * The capabilities a tenant is effectively entitled to.
 *
 * - Standalone mode: the full registry. A single-install deployment is
 *   un-metered, so every capability is included ("free/included in standalone").
 * - SAAS mode: exactly the tenant's effective plan's capabilities.
 *
 * This is the single source of truth both the per-capability server checks and
 * the client gating UI (billing.capabilities) read from.
 */
export async function getEffectiveCapabilities(
  tenantId: number
): Promise<CapabilityKey[]> {
  if ((await getAppMode()) !== "saas") {
    return CAPABILITIES.map(c => c.key);
  }
  const planKey = await getEffectivePlanKey(tenantId);
  const plan = await getPlanByKey(planKey);
  return (plan?.capabilities as CapabilityKey[] | null) ?? [];
}

/** Whether a tenant is entitled to a single capability. */
export async function hasCapability(
  tenantId: number,
  capability: CapabilityKey
): Promise<boolean> {
  return (await getEffectiveCapabilities(tenantId)).includes(capability);
}
