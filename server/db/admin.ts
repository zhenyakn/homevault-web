import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  users,
  tenants,
  tenantMembers,
  properties,
  auditLog,
  type AuditLogRow,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { getSetting, setSetting } from "./appSettings";

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

  const memberMap = new Map(memberCounts.map(r => [r.tenantId, Number(r.n)]));
  const propMap = new Map(propCounts.map(r => [r.tenantId, Number(r.n)]));
  return rows.map(t => ({
    ...t,
    memberCount: memberMap.get(t.id) ?? 0,
    propertyCount: propMap.get(t.id) ?? 0,
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

/** Whether open (un-invited) self-registration is allowed. Defaults to true. */
export async function getSignupsEnabled(): Promise<boolean> {
  const v = await getSetting(SIGNUPS_ENABLED_KEY);
  return v === null ? true : v === "true";
}

export async function setSignupsEnabled(enabled: boolean): Promise<void> {
  await setSetting(SIGNUPS_ENABLED_KEY, enabled ? "true" : "false");
}
