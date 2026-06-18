/**
 * Real-MySQL integration tests for the super-admin console (adminRouter) and the
 * signups-disabled enforcement in auth.register. Skipped unless
 * TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("admin console (real MySQL)", () => {
  let appRouter: typeof import("./routers").appRouter;
  let getDb: typeof import("./db/client").getDb;
  let schema: typeof import("../drizzle/schema");

  const anonCtx = () =>
    ({
      user: null,
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const ctxFor = (userId: number, globalRole: "user" | "superadmin") =>
    ({
      user: { id: userId, globalRole },
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  // A tenant-scoped owner context (passes tenantProcedure / tenantAdminProcedure).
  const ownerCtx = (userId: number, tenantId: number) =>
    ({
      user: { id: userId, globalRole: "user" },
      propertyId: 1,
      tenantId,
      tenantRole: "owner",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const mkUser = async (label: string, globalRole: "user" | "superadmin") => {
    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: label,
      globalRole,
    });
    return (res as any).insertId as number;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("./_core/migrate");
    await runMigrations({ log: () => {} });
    ({ appRouter } = await import("./routers"));
    ({ getDb } = await import("./db/client"));
    schema = await import("../drizzle/schema");
  });

  it("rejects non-superadmins", async () => {
    const uid = await mkUser("plain", "user");
    const caller = appRouter.createCaller(ctxFor(uid, "user"));
    await expect(caller.admin.stats()).rejects.toThrow();
  });

  it("returns server stats for a superadmin", async () => {
    const sid = await mkUser("admin1", "superadmin");
    const caller = appRouter.createCaller(ctxFor(sid, "superadmin"));
    const stats = await caller.admin.stats();
    expect(stats.users).toBeGreaterThan(0);
    expect(stats).toHaveProperty("appMode");
  });

  it("lists users and changes a global role, guarding the last super-admin", async () => {
    // Demote every existing superadmin so we control the count, then make one.
    const db = await getDb();
    await db.update(schema.users).set({ globalRole: "user" });
    const actor = await mkUser("actor", "superadmin");
    const caller = appRouter.createCaller(ctxFor(actor, "superadmin"));

    const target = await mkUser("target", "user");
    await caller.admin.users.setGlobalRole({
      userId: target,
      globalRole: "superadmin",
    });
    const list = await caller.admin.users.list({ search: "target" });
    expect(list.find(u => u.id === target)?.globalRole).toBe("superadmin");

    // Demote target back (2 admins → allowed).
    await caller.admin.users.setGlobalRole({
      userId: target,
      globalRole: "user",
    });

    // Now `actor` is the last superadmin — demoting must fail.
    await expect(
      caller.admin.users.setGlobalRole({ userId: actor, globalRole: "user" })
    ).rejects.toThrow(/last super-admin/i);
  });

  it("lists tenants and suspends / reactivates them", async () => {
    const sid = await mkUser("admin2", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(sid, "Suspendable");
    const caller = appRouter.createCaller(ctxFor(sid, "superadmin"));

    await caller.admin.tenants.setStatus({
      tenantId: tid,
      status: "suspended",
    });
    let list = await caller.admin.tenants.list();
    expect(list.find(t => t.id === tid)?.status).toBe("suspended");

    await caller.admin.tenants.setStatus({ tenantId: tid, status: "active" });
    list = await caller.admin.tenants.list();
    const row = list.find(t => t.id === tid);
    expect(row?.status).toBe("active");
    expect(row?.memberCount).toBeGreaterThanOrEqual(1);
  });

  it("disables open registration via config (invites still allowed)", async () => {
    const sid = await mkUser("admin3", "superadmin");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));
    await admin.admin.config.setSignupsEnabled({ enabled: false });
    expect((await admin.admin.config.get()).signupsEnabled).toBe(false);

    // Open registration is blocked…
    await expect(
      appRouter.createCaller(anonCtx()).auth.register({
        email: `blocked-${Date.now()}@example.com`,
        password: "supersecret",
      })
    ).rejects.toThrow(/registration is currently disabled/i);

    // …but re-enabling restores it.
    await admin.admin.config.setSignupsEnabled({ enabled: true });
    const out = await appRouter.createCaller(anonCtx()).auth.register({
      email: `allowed-${Date.now()}@example.com`,
      password: "supersecret",
    });
    expect(out.success).toBe(true);
  });

  it("switches deployment mode at runtime and mirrors it to the public config", async () => {
    const sid = await mkUser("admin4", "superadmin");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));
    // Keep an explicit signups override in place so flipping the mode here can't
    // change the mode-driven signups default other test files rely on (the
    // settings row is global to the shared test DB).
    await admin.admin.config.setSignupsEnabled({ enabled: true });

    await admin.admin.config.setAppMode({ mode: "saas" });
    expect((await admin.admin.config.get()).appMode).toBe("saas");
    // The public bootstrap query (consumed by signed-out screens) reflects it.
    expect(
      (await appRouter.createCaller(anonCtx()).system.config()).appMode
    ).toBe("saas");

    // Restore so we don't leave the shared DB in SAAS for sibling files.
    await admin.admin.config.setAppMode({ mode: "standalone" });
    expect((await admin.admin.config.get()).appMode).toBe("standalone");
  });

  it("enforces the per-tenant property quota", async () => {
    const sid = await mkUser("quota-owner", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(sid, "Capped");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));

    await admin.admin.tenants.setLimits({
      tenantId: tid,
      maxProperties: 1,
      maxMembers: null,
    });

    const owner = appRouter.createCaller(ownerCtx(sid, tid));
    await owner.property.create({ houseName: "First" });
    await expect(
      owner.property.create({ houseName: "Second" })
    ).rejects.toThrow(/limit of 1 propert/i);

    // Raising the cap lets the next one through.
    await admin.admin.tenants.setLimits({
      tenantId: tid,
      maxProperties: 2,
      maxMembers: null,
    });
    const ok = await owner.property.create({ houseName: "Second" });
    expect(ok).toBeTruthy();
  });

  it("enforces the per-tenant member quota on invited registration", async () => {
    const sid = await mkUser("mquota-owner", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const { generateToken } = await import("./auth/password");
    const tid = await tenantsDb.createTenantWithOwner(sid, "OneSeat");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));

    // Cap at the single existing owner.
    await admin.admin.tenants.setLimits({
      tenantId: tid,
      maxProperties: null,
      maxMembers: 1,
    });

    const known = generateToken();
    await tenantsDb.createInvite({
      tenantId: tid,
      email: `seat-${Date.now()}@example.com`,
      role: "member",
      tokenHash: known.hash,
      invitedByUserId: sid,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      appRouter.createCaller(anonCtx()).auth.register({
        email: `joiner-${Date.now()}@example.com`,
        password: "supersecret",
        inviteToken: known.raw,
      })
    ).rejects.toThrow(/limit of 1 member/i);
  });
});
