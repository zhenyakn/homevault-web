import { eq } from "drizzle-orm";
import {
  tenantSubscriptions,
  type TenantSubscription,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { setTenantLimits } from "./tenants";
import { getPlanByKey } from "./plans";
import { DEFAULT_PLAN_KEY } from "../billing/plans";
import type { SubscriptionStatus } from "../billing/provider";

export async function getSubscription(
  tenantId: number
): Promise<TenantSubscription | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1);
  return rows[0];
}

/** Insert or update the single subscription row for a tenant. */
export async function upsertSubscription(params: {
  tenantId: number;
  planId: string;
  status?: SubscriptionStatus;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
}): Promise<void> {
  const db = await getDb();
  const existing = await getSubscription(params.tenantId);
  const values = {
    planId: params.planId,
    status: params.status ?? "active",
    provider: params.provider ?? null,
    providerCustomerId: params.providerCustomerId ?? null,
    providerSubscriptionId: params.providerSubscriptionId ?? null,
    currentPeriodEnd: params.currentPeriodEnd ?? null,
  };
  if (existing) {
    await db
      .update(tenantSubscriptions)
      .set(values)
      .where(eq(tenantSubscriptions.tenantId, params.tenantId));
  } else {
    await db
      .insert(tenantSubscriptions)
      .values({ tenantId: params.tenantId, ...values });
  }
}

/**
 * Apply a plan to a tenant: record the subscription and copy the plan's limits
 * onto the tenant's quota columns (the single source of truth that enforcement
 * reads). This is the seam both the admin "assign plan" action and provider
 * webhooks funnel through.
 */
export async function applyPlan(
  tenantId: number,
  planKey: string,
  opts: {
    status?: SubscriptionStatus;
    provider?: string | null;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodEnd?: Date | null;
  } = {}
): Promise<void> {
  const plan = await getPlanByKey(planKey);
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);
  await upsertSubscription({ tenantId, planId: planKey, ...opts });
  await setTenantLimits(tenantId, {
    maxProperties: plan.maxProperties,
    maxMembers: plan.maxMembers,
  });
}

/**
 * The plan key a tenant is effectively on — its subscription's plan, or the
 * default (free) when it has none yet / references a deleted plan.
 */
export async function getEffectivePlanKey(tenantId: number): Promise<string> {
  const sub = await getSubscription(tenantId);
  if (sub?.planId && (await getPlanByKey(sub.planId))) return sub.planId;
  return DEFAULT_PLAN_KEY;
}
