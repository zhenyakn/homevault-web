import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  users,
  tenants,
  tenantMembers,
  tenantSubscriptions,
  properties,
  auditLog,
  type AuditLogRow,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { getSetting, setSetting } from "./appSettings";
import { ENV } from "../_core/env";

// ── Server-wide stats ─────────────────────────────────────────────────────────

export async function getServerStats() {
  const db = await getDb();
  const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(tenants);
  const [p] = await db.select({ n: sql<number>`count(*)` }).from(properties);
  return {
    users: Number(u?.n ?? 0),
    tenants: Number(t?.n ?? 0),
    properties: Number(p?.n ?? 0),
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function listUsersForAdmin(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = opts.search?.trim();
  const where = q
    ? or(like(users.name, `%${q}%`), like(users.email, `%${q}%`))
    : undefined;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      globalRole: users.globalRole,
      defaultTenantId: users.defaultTenantId,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.id))
    .limit(limit)
    .offset(offset);
}

export async function setUserGlobalRole(
  userId: number,
  globalRole: "user" | "superadmin"
): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ globalRole }).where(eq(users.id, userId));
}

/** Number of server-wide super-admins — used to block removing the last one. */
export async function countSuperAdmins(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.globalRole, "superadmin"));
  return Number(row?.n ?? 0);
}

// ── Tenants ─────────────────────────────────────────────────────────────────

export async function listTenantsForAdmin(opts: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = await db
    .select()
    .from(tenants)
    .orderBy(desc(tenants.id))
    .limit(limit)
    .offset(offset);
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);
  const memberCounts = await db
    .select({ tenantId: tenantMembers.tenantId, n: sql<number>`count(*)` })
    .from(tenantMembers)
    .where(
      and(
        inArray(tenantMembers.tenantId, ids),
        eq(tenantMembers.status, "active")
      )
    )
    .groupBy(tenantMembers.tenantId);
  const propCounts = await db
    .select({ tenantId: properties.tenantId, n: sql<number>`count(*)` })
    .from(properties)
    .where(inArray(properties.tenantId, ids))
    .groupBy(properties.tenantId);

  const subs = await db
    .select({
      tenantId: tenantSubscriptions.tenantId,
      planId: tenantSubscriptions.planId,
      status: tenantSubscriptions.status,
    })
    .from(tenantSubscriptions)
    .where(inArray(tenantSubscriptions.tenantId, ids));

  const memberMap = new Map(memberCounts.map(r => [r.tenantId, Number(r.n)]));
  const propMap = new Map(propCounts.map(r => [r.tenantId, Number(r.n)]));
  const subMap = new Map(subs.map(s => [s.tenantId, s]));
  return rows.map(t => ({
    ...t,
    memberCount: memberMap.get(t.id) ?? 0,
    propertyCount: propMap.get(t.id) ?? 0,
    planId: subMap.get(t.id)?.planId ?? null,
    subscriptionStatus: subMap.get(t.id)?.status ?? null,
  }));
}

export async function setTenantStatus(
  tenantId: number,
  status: "active" | "suspended"
): Promise<void> {
  const db = await getDb();
  await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
}

// ── Audit (global) ────────────────────────────────────────────────────────────

export async function getRecentAudit(limit = 100): Promise<AuditLogRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(Math.min(500, Math.max(1, limit)));
}

// ── Global server config (app_settings-backed) ────────────────────────────────

const SIGNUPS_ENABLED_KEY = "auth.signupsEnabled";
const APP_MODE_KEY = "app.mode";

export type AppMode = "standalone" | "saas";

/**
 * The effective deployment mode. An admin-set override in `app_settings` wins
 * over the `APP_MODE` env default, so the cloud↔standalone switch can be flipped
 * at runtime from the admin console without a redeploy. Falls back to the env
 * value (itself defaulting to `standalone`) when no override is stored.
 */
export async function getAppMode(): Promise<AppMode> {
  const v = await getSetting(APP_MODE_KEY);
  if (v === "standalone" || v === "saas") return v;
  return ENV.appMode;
}

/** Persist the deployment-mode override used by {@link getAppMode}. */
export async function setAppMode(mode: AppMode): Promise<void> {
  await setSetting(APP_MODE_KEY, mode);
}

/**
 * Whether open (un-invited) self-registration is allowed. An explicit admin
 * toggle wins; otherwise the default is mode-driven — open in SAAS (self-serve
 * signup is the point) and closed in standalone (single-install, invite-only).
 */
export async function getSignupsEnabled(): Promise<boolean> {
  const v = await getSetting(SIGNUPS_ENABLED_KEY);
  if (v !== null) return v === "true";
  return (await getAppMode()) === "saas";
}

export async function setSignupsEnabled(enabled: boolean): Promise<void> {
  await setSetting(SIGNUPS_ENABLED_KEY, enabled ? "true" : "false");
}

const REQUIRE_EMAIL_VERIFICATION_KEY = "auth.requireEmailVerification";
const EMAIL_VERIFICATION_GRACE_HOURS_KEY = "auth.emailVerificationGraceHours";

/**
 * Whether unverified accounts are blocked from signing in (after any grace
 * window). An explicit admin toggle wins; otherwise the default is mode-driven —
 * enforced in SAAS, relaxed in standalone.
 */
export async function getRequireEmailVerification(): Promise<boolean> {
  const v = await getSetting(REQUIRE_EMAIL_VERIFICATION_KEY);
  if (v !== null) return v === "true";
  return (await getAppMode()) === "saas";
}

export async function setRequireEmailVerification(
  enabled: boolean
): Promise<void> {
  await setSetting(REQUIRE_EMAIL_VERIFICATION_KEY, enabled ? "true" : "false");
}

/**
 * Hours after account creation during which an unverified user may still sign in
 * even when verification is required. 0 (the default) means strict — block from
 * the first login attempt.
 */
export async function getEmailVerificationGraceHours(): Promise<number> {
  const v = await getSetting(EMAIL_VERIFICATION_GRACE_HOURS_KEY);
  const n = v === null ? 0 : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setEmailVerificationGraceHours(
  hours: number
): Promise<void> {
  const n = Math.max(0, Math.floor(hours));
  await setSetting(EMAIL_VERIFICATION_GRACE_HOURS_KEY, String(n));
}
