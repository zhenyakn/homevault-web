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
  let carol: number;

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
    carol = await mkUser("Carol");
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

  describe("resolveActiveTenant", () => {
    it("provisions a personal tenant for a user with no membership", async () => {
      const fresh = await mkUser("Fresh");
      const active = await tenantsDb.resolveActiveTenant(fresh, {
        displayName: "Fresh",
      });
      expect(active.role).toBe("owner");

      // The provisioned tenant is now their default and shows in their list.
      const tenant = await tenantsDb.getTenantById(active.tenantId);
      expect(tenant?.createdByUserId).toBe(fresh);
      const mine = await tenantsDb.getTenantsForUser(fresh);
      expect(mine.map(t => t.id)).toContain(active.tenantId);

      // Idempotent: a second resolve reuses the same tenant.
      const again = await tenantsDb.resolveActiveTenant(fresh, {});
      expect(again.tenantId).toBe(active.tenantId);
    });

    it("honours requested tenant, then default, then first membership", async () => {
      const u = await mkUser("Multi");
      const a = await tenantsDb.createTenantWithOwner(u, "A");
      const b = await tenantsDb.createTenantWithOwner(u, "B");

      // Requested wins when the user is a member.
      expect(
        (await tenantsDb.resolveActiveTenant(u, { requestedTenantId: b }))
          .tenantId
      ).toBe(b);

      // A tenant the user is NOT a member of is ignored; falls back to default.
      const outsider = await tenantsDb.createTenantWithOwner(
        await mkUser("Outsider"),
        "Z"
      );
      expect(
        (
          await tenantsDb.resolveActiveTenant(u, {
            requestedTenantId: outsider,
            defaultTenantId: a,
          })
        ).tenantId
      ).toBe(a);

      // No hints → first membership.
      const first = (await tenantsDb.getTenantsForUser(u))[0].id;
      expect((await tenantsDb.resolveActiveTenant(u, {})).tenantId).toBe(first);
    });
  });

  describe("tenant router procedure guards", () => {
    let appRouter: typeof import("../routers").appRouter;

    const mkCtx = (
      userId: number,
      tenantId: number,
      role: "owner" | "admin" | "member" | "viewer"
    ): any => ({
      user: { id: userId, role: "user", globalRole: "user" },
      propertyId: 1,
      tenantId,
      tenantRole: role,
      req: { headers: {} },
      res: {},
    });

    beforeAll(async () => {
      ({ appRouter } = await import("../routers"));
    });

    it("tenant.current returns the active tenant with role", async () => {
      const tid = await tenantsDb.createTenantWithOwner(alice, "Caller Home");
      const caller = appRouter.createCaller(mkCtx(alice, tid, "owner"));
      const current = await caller.tenant.current();
      expect(current?.id).toBe(tid);
      expect(current?.role).toBe("owner");
    });

    it("tenant.members allows owner/admin but rejects member/viewer", async () => {
      const tid = await tenantsDb.createTenantWithOwner(alice, "Guard Home");
      await tenantsDb.addMember({ tenantId: tid, userId: bob, role: "member" });

      const ownerCaller = appRouter.createCaller(mkCtx(alice, tid, "owner"));
      const members = await ownerCaller.tenant.members();
      expect(members.length).toBeGreaterThanOrEqual(2);

      const memberCaller = appRouter.createCaller(mkCtx(bob, tid, "member"));
      await expect(memberCaller.tenant.members()).rejects.toThrow();
    });

    it("tenantProcedure rejects when no active tenant is resolved", async () => {
      const noTenantCtx: any = {
        user: { id: alice, role: "user", globalRole: "user" },
        propertyId: 1,
        tenantId: null,
        tenantRole: null,
        req: { headers: {} },
        res: {},
      };
      const caller = appRouter.createCaller(noTenantCtx);
      await expect(caller.tenant.current()).rejects.toThrow();
    });
  });

  describe("cross-tenant data isolation", () => {
    let appRouter: typeof import("../routers").appRouter;

    const callerFor = async (userId: number) => {
      // Resolve the user's tenant the same way the request context does, then
      // build a caller scoped to it (propertyId resolves server-side per call).
      const active = await tenantsDb.resolveActiveTenant(userId, {});
      const props = await (
        await import("./properties")
      ).getPropertiesByTenant(active.tenantId);
      return appRouter.createCaller({
        user: { id: userId, role: "user", globalRole: "user" },
        propertyId: props[0]?.id ?? 1,
        tenantId: active.tenantId,
        tenantRole: active.role,
        req: { headers: {} },
        res: {},
      } as any);
    };

    beforeAll(async () => {
      ({ appRouter } = await import("../routers"));
    });

    it("a member shares access; an outsider cannot read or mutate", async () => {
      // Alice owns a tenant with a property + an expense; Bob is added as a
      // member and must see/edit it. Carol (separate tenant) must not.
      const aliceCaller = await callerFor(alice);
      await aliceCaller.property.createWithWizard({
        mode: "owned_personal",
        houseName: "Shared House",
      });

      // Re-resolve Alice's caller so the active property is the new one.
      const tenantId = (await tenantsDb.resolveActiveTenant(alice, {}))
        .tenantId;
      const aliceProps = await (
        await import("./properties")
      ).getPropertiesByTenant(tenantId);
      const sharedProp = aliceProps.find(p => p.houseName === "Shared House")!;
      const mkCaller = (userId: number) =>
        appRouter.createCaller({
          user: { id: userId, role: "user", globalRole: "user" },
          propertyId: sharedProp.id,
          tenantId,
          tenantRole: "owner",
          req: { headers: {} },
          res: {},
        } as any);

      const expense = await mkCaller(alice).expenses.create({
        name: "Shared bill",
        amount: 1000,
        date: "2026-02-01",
        category: "Utilities",
      });

      // Bob joins Alice's tenant → sees the shared expense and can edit it.
      await tenantsDb.addMember({ tenantId, userId: bob, role: "member" });
      const bobList = await mkCaller(bob).expenses.list();
      expect(bobList.map(e => e.id)).toContain(expense.id);
      await mkCaller(bob).expenses.update({
        id: expense.id,
        data: { amount: 2000 },
      });

      // Carol (her own tenant) cannot see Alice's tenant's data, and updating
      // the shared expense from her tenant is a no-op (wrong tenant scope).
      const carolCaller = await callerFor(carol);
      const carolList = await carolCaller.expenses.list();
      expect(carolList.map(e => e.id)).not.toContain(expense.id);

      await carolCaller.expenses.update({
        id: expense.id,
        data: { amount: 999999 },
      });
      const afterCarol = await (
        await import("./expenses")
      ).getExpenseById(expense.id);
      expect(afterCarol?.amount).toBe(2000); // unchanged by Carol
    });
  });
});
