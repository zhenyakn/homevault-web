import { asc, eq } from "drizzle-orm";
import { plans, tenantSubscriptions, type Plan } from "../../drizzle/schema";
import { getDb } from "./client";
import { SEED_PLANS } from "../billing/plans";
import {
  sanitizeCapabilities,
  type CapabilityKey,
} from "../billing/capabilities";

export type PlanInput = {
  key: string;
  name: string;
  isPaid: boolean;
  priceCents: number;
  currency: string;
  interval: "month" | "year" | "none";
  maxProperties: number | null;
  maxMembers: number | null;
  capabilities: CapabilityKey[];
  checkoutUrl: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * Normalise a plan row's `capabilities`. MariaDB's JSON type is LONGTEXT under
 * the hood, so the driver hands it back as a raw string rather than a parsed
 * array — coerce it here so every reader (server gating, admin UI, tenant view)
 * gets a real `CapabilityKey[]`.
 */
function normalizePlan(p: Plan): Plan {
  const raw: unknown = p.capabilities;
  let caps: CapabilityKey[];
  if (Array.isArray(raw)) {
    caps = sanitizeCapabilities(raw);
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      caps = sanitizeCapabilities(JSON.parse(raw));
    } catch {
      caps = [];
    }
  } else {
    caps = [];
  }
  return { ...p, capabilities: caps };
}

/** All plans, ordered for display. */
export async function listPlans(): Promise<Plan[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(plans)
    .orderBy(asc(plans.sortOrder), asc(plans.id));
  return rows.map(normalizePlan);
}

/** Only the active plans (what tenants may self-select). */
export async function listActivePlans(): Promise<Plan[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder), asc(plans.id));
  return rows.map(normalizePlan);
}

export async function getPlanByKey(key: string): Promise<Plan | undefined> {
  const db = await getDb();
  const rows = await db.select().from(plans).where(eq(plans.key, key)).limit(1);
  return rows[0] ? normalizePlan(rows[0]) : undefined;
}

export async function createPlan(input: PlanInput): Promise<void> {
  const db = await getDb();
  await db.insert(plans).values({
    ...input,
    capabilities: sanitizeCapabilities(input.capabilities),
  });
}

/** Update a plan by its (immutable) key. */
export async function updatePlan(
  key: string,
  input: Omit<PlanInput, "key">
): Promise<void> {
  const db = await getDb();
  await db
    .update(plans)
    .set({
      name: input.name,
      isPaid: input.isPaid,
      priceCents: input.priceCents,
      currency: input.currency,
      interval: input.interval,
      maxProperties: input.maxProperties,
      maxMembers: input.maxMembers,
      capabilities: sanitizeCapabilities(input.capabilities),
      checkoutUrl: input.checkoutUrl,
      sortOrder: input.sortOrder,
      active: input.active,
    })
    .where(eq(plans.key, key));
}

/** How many tenants are currently subscribed to a plan (delete guard). */
export async function countSubscribersOfPlan(key: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: tenantSubscriptions.id })
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.planId, key));
  return rows.length;
}

export async function deletePlan(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(plans).where(eq(plans.key, key));
}

/**
 * Ensure the default plan catalog exists (idempotent). Mirrors the migration's
 * seed so programmatic/test setups don't depend on the .mjs script.
 */
export async function seedDefaultPlans(): Promise<void> {
  const db = await getDb();
  for (const p of SEED_PLANS) {
    const existing = await getPlanByKey(p.key);
    if (!existing) {
      await db.insert(plans).values({
        key: p.key,
        name: p.name,
        isPaid: p.isPaid,
        priceCents: p.priceCents,
        currency: p.currency,
        interval: p.interval,
        maxProperties: p.maxProperties,
        maxMembers: p.maxMembers,
        capabilities: p.capabilities,
        sortOrder: p.sortOrder,
        active: true,
      });
    }
  }
}
