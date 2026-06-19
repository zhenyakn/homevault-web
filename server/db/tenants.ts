import { and, eq, gt, isNull, desc, sql } from "drizzle-orm";
import {
  tenants,
  tenantMembers,
  tenantInvites,
  properties,
  users,
  type InsertTenant,
  type Tenant,
  type TenantMember,
  type TenantInvite,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { setUserDefaultTenant } from "./users";

export type InviteRole = TenantInvite["role"];

export type TenantRole = TenantMember["role"];

/** A tenant paired with the requesting user's role within it. */
export type TenantWithRole = Tenant & { role: TenantRole };

/** The active tenant for a request, with the user's role and the tenant status. */
export type ActiveTenant = {
  tenantId: number;
  role: TenantRole;
  status: Tenant["status"];
};

export async function getTenantById(
  tenantId: number
): Promise<Tenant | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0];
}

/** The active membership linking a user to a tenant, if any. */
export async function getMembership(
  userId: number,
  tenantId: number
): Promise<TenantMember | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.status, "active")
      )
    )
    .limit(1);
  return rows[0];
}

/** All tenants a user is an active member of, with their role in each. */
export async function getTenantsForUser(
  userId: number
): Promise<TenantWithRole[]> {
  const db = await getDb();
  const rows = await db
    .select({ tenant: tenants, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(
      and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, "active"))
    );
  return rows.map(r => ({ ...r.tenant, role: r.role }));
}

/**
 * Active members of a tenant joined with their user record. Removed (soft-
 * deleted) memberships are excluded so they don't appear in the members UI or
 * inflate the owner-count guards in the member-management mutations.
 */
export async function getMembersOfTenant(tenantId: number) {
  const db = await getDb();
  return db
    .select({
      membershipId: tenantMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: tenantMembers.role,
      status: tenantMembers.status,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.status, "active")
      )
    );
}

/**
 * Create a tenant and add the creator as its owner. Returns the new tenant id.
 * The two writes are wrapped in a transaction so a tenant is never left without
 * an owner.
 */
export async function createTenantWithOwner(
  ownerUserId: number,
  name: string,
  opts: { slug?: string } = {}
): Promise<number> {
  const db = await getDb();
  return db.transaction(async tx => {
    const values: InsertTenant = {
      name,
      slug: opts.slug ?? null,
      createdByUserId: ownerUserId,
    };
    const [res] = await tx.insert(tenants).values(values);
    const tenantId = (res as any).insertId as number;
    await tx.insert(tenantMembers).values({
      tenantId,
      userId: ownerUserId,
      role: "owner",
      status: "active",
    });
    return tenantId;
  });
}

/**
 * Add (or re-activate) a user's membership in a tenant. Idempotent on the
 * (tenantId, userId) unique key — an existing row has its role/status refreshed.
 */
export async function addMember(params: {
  tenantId: number;
  userId: number;
  role: TenantRole;
  invitedByUserId?: number;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(tenantMembers)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      role: params.role,
      status: "active",
      invitedByUserId: params.invitedByUserId ?? null,
    })
    .onDuplicateKeyUpdate({
      set: { role: params.role, status: "active" },
    });
}

export async function setMemberRole(
  tenantId: number,
  userId: number,
  role: TenantRole
): Promise<void> {
  const db = await getDb();
  await db
    .update(tenantMembers)
    .set({ role })
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId)
      )
    );
}

/** Soft-remove a member (status → 'removed') so audit history is preserved. */
export async function removeMember(
  tenantId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  await db
    .update(tenantMembers)
    .set({ status: "removed" })
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId)
      )
    );
}

/**
 * Guarantee that a user belongs to at least one tenant. Users created before
 * Stage 1, or via an auth path that doesn't yet run the registration flow
 * (OAuth / NO_AUTH), may have no membership; this provisions a personal tenant
 * (owner membership) and records it as their default. Returns the membership
 * the user can act under right now. Idempotent: a no-op once a membership exists.
 */
export async function ensurePersonalTenant(
  userId: number,
  displayName?: string | null
): Promise<ActiveTenant> {
  const existing = await getTenantsForUser(userId);
  if (existing.length > 0) {
    return {
      tenantId: existing[0].id,
      role: existing[0].role,
      status: existing[0].status,
    };
  }
  const name = `${(displayName ?? "").trim() || "User"}'s Home`;
  const tenantId = await createTenantWithOwner(userId, name);
  await setUserDefaultTenant(userId, tenantId);
  return { tenantId, role: "owner", status: "active" };
}

/**
 * Resolve the tenant a request should operate in. Preference order:
 *   1. the requested tenant (x-tenant-id header) if the user is an active member
 *   2. the user's recorded default tenant if still a member
 *   3. the user's first active membership
 * If the user has no membership at all, a personal tenant is provisioned.
 */
export async function resolveActiveTenant(
  userId: number,
  opts: {
    requestedTenantId?: number | null;
    defaultTenantId?: number | null;
    displayName?: string | null;
  } = {}
): Promise<ActiveTenant> {
  const memberships = await getTenantsForUser(userId);
  if (memberships.length === 0) {
    return ensurePersonalTenant(userId, opts.displayName);
  }

  const pick = (id: number | null | undefined) =>
    id != null ? memberships.find(m => m.id === id) : undefined;

  const chosen =
    pick(opts.requestedTenantId) ??
    pick(opts.defaultTenantId) ??
    memberships[0];

  return { tenantId: chosen.id, role: chosen.role, status: chosen.status };
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function createInvite(params: {
  tenantId: number;
  email: string;
  role: InviteRole;
  tokenHash: string;
  invitedByUserId: number;
  expiresAt: Date;
}): Promise<void> {
  const db = await getDb();
  await db.insert(tenantInvites).values({
    tenantId: params.tenantId,
    email: params.email,
    role: params.role,
    tokenHash: params.tokenHash,
    invitedByUserId: params.invitedByUserId,
    expiresAt: params.expiresAt,
  });
}

/** Pending (not yet accepted) invites for a tenant, newest first. */
export async function listPendingInvites(
  tenantId: number
): Promise<TenantInvite[]> {
  const db = await getDb();
  return db
    .select()
    .from(tenantInvites)
    .where(
      and(
        eq(tenantInvites.tenantId, tenantId),
        isNull(tenantInvites.acceptedAt)
      )
    )
    .orderBy(desc(tenantInvites.id));
}

/** A live invite by token hash: not yet accepted and not expired. */
export async function getLiveInviteByTokenHash(
  tokenHash: string
): Promise<TenantInvite | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tenantInvites)
    .where(
      and(
        eq(tenantInvites.tokenHash, tokenHash),
        isNull(tenantInvites.acceptedAt),
        gt(tenantInvites.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows[0];
}

export async function markInviteAccepted(inviteId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(tenantInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(tenantInvites.id, inviteId));
}

/** Revoke a pending invite (scoped to the tenant so admins can't touch others). */
export async function revokeInvite(
  inviteId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  await db
    .delete(tenantInvites)
    .where(
      and(eq(tenantInvites.id, inviteId), eq(tenantInvites.tenantId, tenantId))
    );
}

// ── Quotas ────────────────────────────────────────────────────────────────────

/** Count active members in a tenant (for member-quota enforcement). */
export async function countActiveMembers(tenantId: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.status, "active")
      )
    );
  return Number(row?.n ?? 0);
}

/** Count properties in a tenant (for property-quota enforcement). */
export async function countPropertiesForTenant(
  tenantId: number
): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(properties)
    .where(eq(properties.tenantId, tenantId));
  return Number(row?.n ?? 0);
}

/** Set (or clear, with null) a tenant's quotas. Superadmin-only via adminRouter. */
export async function setTenantLimits(
  tenantId: number,
  limits: { maxProperties: number | null; maxMembers: number | null }
): Promise<void> {
  const db = await getDb();
  await db
    .update(tenants)
    .set({
      maxProperties: limits.maxProperties,
      maxMembers: limits.maxMembers,
    })
    .where(eq(tenants.id, tenantId));
}
