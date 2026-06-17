/**
 * Real-MySQL integration tests for the tenant/membership helpers. Skipped
 * unless TEST_DATABASE_URL points at a throwaway MySQL:
 *
 *   TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/homevault_test pnpm test
 *
 * Verifies tenant creation with an owner membership, multi-member access,
 * idempotent membership upsert, role changes, and soft removal.
 */
import { describe, it, expect, beforeAll } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("tenant helpers (real MySQL)", () => {
  let tenantsDb: typeof import("./tenants");
  let getDb: typeof import("./client").getDb;
  let schema: typeof import("../../drizzle/schema");
  let alice: number;
  let bob: number;

  const mkUser = async (label: string): Promise<number> => {
    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: label,
    });
    return (res as any).insertId as number;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });

    ({ getDb } = await import("./client"));
    schema = await import("../../drizzle/schema");
    tenantsDb = await import("./tenants");

    alice = await mkUser("Alice");
    bob = await mkUser("Bob");
  });

  it("creates a tenant with the creator as owner", async () => {
    const tenantId = await tenantsDb.createTenantWithOwner(alice, "Alice Home");
    expect(tenantId).toBeGreaterThan(0);

    const tenant = await tenantsDb.getTenantById(tenantId);
    expect(tenant?.name).toBe("Alice Home");
    expect(tenant?.createdByUserId).toBe(alice);

    const membership = await tenantsDb.getMembership(alice, tenantId);
    expect(membership?.role).toBe("owner");
    expect(membership?.status).toBe("active");

    const mine = await tenantsDb.getTenantsForUser(alice);
    expect(mine.map(t => t.id)).toContain(tenantId);
    expect(mine.find(t => t.id === tenantId)?.role).toBe("owner");
  });

  it("shares a tenant with a second member and upserts idempotently", async () => {
    const tenantId = await tenantsDb.createTenantWithOwner(
      alice,
      "Shared Home"
    );

    await tenantsDb.addMember({ tenantId, userId: bob, role: "member" });
    let m = await tenantsDb.getMembership(bob, tenantId);
    expect(m?.role).toBe("member");

    // Re-adding the same user is a no-op-style upsert (no duplicate row), and
    // can change the role.
    await tenantsDb.addMember({ tenantId, userId: bob, role: "admin" });
    m = await tenantsDb.getMembership(bob, tenantId);
    expect(m?.role).toBe("admin");

    const members = await tenantsDb.getMembersOfTenant(tenantId);
    const bobRows = members.filter(r => r.userId === bob);
    expect(bobRows).toHaveLength(1);

    // Bob now sees the shared tenant in his list.
    const bobsTenants = await tenantsDb.getTenantsForUser(bob);
    expect(bobsTenants.map(t => t.id)).toContain(tenantId);
  });

  it("changes a role and soft-removes a member", async () => {
    const tenantId = await tenantsDb.createTenantWithOwner(alice, "Role Home");
    await tenantsDb.addMember({ tenantId, userId: bob, role: "member" });

    await tenantsDb.setMemberRole(tenantId, bob, "viewer");
    expect((await tenantsDb.getMembership(bob, tenantId))?.role).toBe("viewer");

    await tenantsDb.removeMember(tenantId, bob);
    // getMembership only returns active rows.
    expect(await tenantsDb.getMembership(bob, tenantId)).toBeUndefined();
    expect(
      (await tenantsDb.getTenantsForUser(bob)).map(t => t.id)
    ).not.toContain(tenantId);
  });
});
