/**
 * Static plan catalog. Kept in code (not the DB) so tiers are versioned with
 * the app and easy to reason about; a tenant's *assignment* to a plan lives in
 * the `tenant_subscriptions` table. Limits map directly onto the Phase-12 quota
 * columns (NULL = unlimited).
 */
export type PlanId = "free" | "starter" | "pro" | "unlimited";

export type Plan = {
  id: PlanId;
  name: string;
  /** Price in minor units (cents) for the interval; 0 = free. */
  priceCents: number;
  interval: "month" | "year" | "none";
  maxProperties: number | null;
  maxMembers: number | null;
};

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    priceCents: 0,
    interval: "none",
    maxProperties: 1,
    maxMembers: 2,
  },
  {
    id: "starter",
    name: "Starter",
    priceCents: 900,
    interval: "month",
    maxProperties: 3,
    maxMembers: 5,
  },
  {
    id: "pro",
    name: "Pro",
    priceCents: 2900,
    interval: "month",
    maxProperties: 10,
    maxMembers: 20,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    priceCents: 9900,
    interval: "month",
    maxProperties: null,
    maxMembers: null,
  },
] as const;

export const DEFAULT_PLAN_ID: PlanId = "free";

export function getPlan(id: string): Plan | undefined {
  return PLANS.find(p => p.id === id);
}

export function isPlanId(id: string): id is PlanId {
  return PLANS.some(p => p.id === id);
}
