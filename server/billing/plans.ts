import type { CapabilityKey } from "./capabilities";

/**
 * Plans are admin-managed and live in the `plans` table (see server/db/plans.ts).
 * This module only holds the things that must be stable in code: the default
 * plan key every tenant falls back to, and the seed definitions the boot
 * migration installs on a fresh database.
 */
export const DEFAULT_PLAN_KEY = "free";

export type PlanInterval = "month" | "year" | "none";

export type SeedPlan = {
  key: string;
  name: string;
  isPaid: boolean;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  maxProperties: number | null;
  maxMembers: number | null;
  capabilities: CapabilityKey[];
  sortOrder: number;
};

/** Mirrors the seed in apply-migration-addon.mjs; used by tests / programmatic
 *  seeding so both paths agree. */
export const SEED_PLANS: readonly SeedPlan[] = [
  {
    key: "free",
    name: "Free",
    isPaid: false,
    priceCents: 0,
    currency: "ils",
    interval: "none",
    maxProperties: 1,
    maxMembers: 2,
    capabilities: [],
    sortOrder: 0,
  },
  {
    key: "starter",
    name: "Starter",
    isPaid: true,
    priceCents: 2900,
    currency: "ils",
    interval: "month",
    maxProperties: 3,
    maxMembers: 5,
    capabilities: ["files.upload"],
    sortOrder: 1,
  },
  {
    key: "pro",
    name: "Pro",
    isPaid: true,
    priceCents: 7900,
    currency: "ils",
    interval: "month",
    maxProperties: 10,
    maxMembers: 20,
    capabilities: ["files.upload", "data.export", "apartment.search"],
    sortOrder: 2,
  },
  {
    key: "unlimited",
    name: "Unlimited",
    isPaid: true,
    priceCents: 19900,
    currency: "ils",
    interval: "month",
    maxProperties: null,
    maxMembers: null,
    capabilities: [
      "files.upload",
      "data.export",
      "apartment.search",
      "notifications.telegram",
      "notifications.whatsapp",
    ],
    sortOrder: 3,
  },
] as const;
