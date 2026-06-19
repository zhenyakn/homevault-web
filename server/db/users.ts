import { and, eq, ne, sql } from "drizzle-orm";
import {
  users,
  tenantMembers,
  userCredentials,
  emailTokens,
  type InsertUser,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { ENV } from "../_core/env";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  // Server-wide admin is driven by globalRole. Honour an explicit globalRole,
  // and always promote the configured owner so the NO_AUTH / dev owner can
  // reach the admin console.
  if (user.globalRole !== undefined) {
    values.globalRole = user.globalRole;
    updateSet.globalRole = user.globalRole;
  } else if (user.openId === ENV.ownerOpenId) {
    values.globalRole = "superadmin";
    updateSet.globalRole = "superadmin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function setUserLanguage(
  userId: number,
  language: string
): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ language }).where(eq(users.id, userId));
}

export async function setUserDefaultTenant(
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  await db
    .update(users)
    .set({ defaultTenantId: tenantId })
    .where(eq(users.id, userId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  return await db.select().from(users);
}

/** Enable/disable an account. A disabled user is locked out at the next request. */
export async function setUserStatus(
  userId: number,
  status: "active" | "disabled"
): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

/**
 * Invalidate every session previously issued to a user by advancing their
 * session epoch (the JWT carries the epoch at mint time; a mismatch on the next
 * request forces re-authentication). Called on password change/reset, account
 * disable, and explicit "sign out everywhere".
 */
export async function bumpSessionEpoch(userId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(users)
    .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
    .where(eq(users.id, userId));
}

/**
 * Tenant ids where this user is the *only* active owner. Deleting such a user
 * would orphan the workspace, so the admin must transfer ownership or delete the
 * tenant first.
 */
export async function getSoleOwnerTenantIds(userId: number): Promise<number[]> {
  const db = await getDb();
  // Tenants this user owns…
  const owned = await db
    .select({ tenantId: tenantMembers.tenantId })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.role, "owner"),
        eq(tenantMembers.status, "active")
      )
    );
  const result: number[] = [];
  for (const { tenantId } of owned) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.role, "owner"),
          eq(tenantMembers.status, "active"),
          ne(tenantMembers.userId, userId)
        )
      );
    if (Number(row?.n ?? 0) === 0) result.push(tenantId);
  }
  return result;
}

/**
 * Hard-delete a user account: their credentials, email tokens, and tenant
 * memberships, then the user row itself. Data they authored (ownerId) is left
 * intact for the tenant — attribution may dangle but the workspace's records
 * survive. Callers must first ensure the user isn't the sole owner of any tenant
 * (see {@link getSoleOwnerTenantIds}) and isn't the last super-admin.
 */
export async function deleteUserAccount(userId: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async tx => {
    await tx.delete(emailTokens).where(eq(emailTokens.userId, userId));
    await tx
      .delete(userCredentials)
      .where(eq(userCredentials.userId, userId));
    await tx.delete(tenantMembers).where(eq(tenantMembers.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
