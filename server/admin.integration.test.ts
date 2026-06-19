/**
 * Real-MySQL integration tests for the super-admin console (adminRouter) and the
 * signups-disabled enforcement in auth.register. Skipped unless
 * TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

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

  it("creates a user directly with a password and lets them sign in", async () => {
    const sid = await mkUser("creator", "superadmin");
    const caller = appRouter.createCaller(ctxFor(sid, "superadmin"));

    const email = `made-${Date.now()}@example.com`;
    const res = await caller.admin.users.create({
      email,
      password: "supersecret1",
      name: "Made By Admin",
      tenantName: "Admin-Made Household",
    });
    expect(res.success).toBe(true);
    expect(res.userId).toBeGreaterThan(0);

    // The account is pre-verified and lands in the named workspace as owner.
    const creds = await import("./db/credentials");
    const cred = await creds.getCredentialByEmail(email);
    expect(cred?.emailVerifiedAt).toBeTruthy();
    const tenantsDb = await import("./db/tenants");
    const tenants = await tenantsDb.getTenantsForUser(res.userId);
    expect(tenants).toHaveLength(1);
    expect(tenants[0].name).toBe("Admin-Made Household");
    expect(tenants[0].role).toBe("owner");

    // The user can immediately sign in with the issued password — even with the
    // strict email-verification gate on, because the account is pre-verified.
    const adminDb = await import("./db/admin");
    await adminDb.setRequireEmailVerification(true);
    await adminDb.setEmailVerificationGraceHours(0);
    const login = await appRouter
      .createCaller(anonCtx())
      .auth.login({ email, password: "supersecret1" });
    expect(login.success).toBe(true);
    await adminDb.setRequireEmailVerification(false);

    // Duplicate email is rejected.
    await expect(
      caller.admin.users.create({ email, password: "anotherpw1" })
    ).rejects.toThrow(/already exists/i);
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
        password: "supersecret1",
      })
    ).rejects.toThrow(/registration is currently disabled/i);

    // …but re-enabling restores it.
    await admin.admin.config.setSignupsEnabled({ enabled: true });
    const out = await appRouter.createCaller(anonCtx()).auth.register({
      email: `allowed-${Date.now()}@example.com`,
      password: "supersecret1",
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
    // Invite and register under the same address — the invite is bound to its
    // target email, so a mismatch would trip that guard before the quota check.
    const joinEmail = `seat-${Date.now()}@example.com`;
    await tenantsDb.createInvite({
      tenantId: tid,
      email: joinEmail,
      role: "member",
      tokenHash: known.hash,
      invitedByUserId: sid,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      appRouter.createCaller(anonCtx()).auth.register({
        email: joinEmail,
        password: "supersecret1",
        inviteToken: known.raw,
      })
    ).rejects.toThrow(/limit of 1 member/i);
  });

  it("assigns a billing plan and binds its limits to the tenant quotas", async () => {
    const sid = await mkUser("plan-owner", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(sid, "Planned");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));

    const { plans } = await admin.admin.billing.plans();
    expect(plans.length).toBeGreaterThan(0);

    await admin.admin.billing.assignPlan({ tenantId: tid, planId: "pro" });

    // The Pro plan's limits (10 / 20) are copied onto the tenant quotas.
    const tenant = await tenantsDb.getTenantById(tid);
    expect(tenant?.maxProperties).toBe(10);
    expect(tenant?.maxMembers).toBe(20);

    // Surfaced in the admin tenant list and the tenant-facing billing.current.
    const list = await admin.admin.tenants.list();
    expect(list.find(t => t.id === tid)?.planId).toBe("pro");

    const owner = appRouter.createCaller(ownerCtx(sid, tid));
    const current = await owner.billing.current();
    expect(current.plan?.key).toBe("pro");
    expect(current.usage.maxMembers).toBe(20);

    // Unknown plans are rejected.
    await expect(
      admin.admin.billing.assignPlan({ tenantId: tid, planId: "enterprise" })
    ).rejects.toThrow(/unknown plan/i);
  });

  it("exports a tenant's data then hard-deletes it (cascade)", async () => {
    const sid = await mkUser("gdpr-owner", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(sid, "Erasable");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));
    const owner = appRouter.createCaller(ownerCtx(sid, tid));

    // Seed a property + an expense under it.
    const created: any = await owner.property.create({ houseName: "House A" });
    const propertyId = created.insertId ?? created.id ?? created;
    const db = await getDb();
    await db.insert(schema.expenses).values({
      id: `exp-${Date.now()}`,
      tenantId: tid,
      propertyId,
      ownerId: sid,
      name: "Test expense",
      amount: "10.00",
      date: "2026-06-18",
    });

    // Export includes the seeded rows + the membership roster.
    const dump = await admin.admin.tenants.export({ tenantId: tid });
    expect(dump.tenant?.id).toBe(tid);
    expect(dump.properties.length).toBeGreaterThanOrEqual(1);
    expect(dump.expenses.length).toBeGreaterThanOrEqual(1);
    expect(dump.members.length).toBeGreaterThanOrEqual(1);

    // Delete requires the confirm flag.
    await admin.admin.tenants.delete({ tenantId: tid, confirm: true });

    // Tenant + its scoped rows are gone; the user (sid) survives.
    expect(await tenantsDb.getTenantById(tid)).toBeUndefined();
    expect(await tenantsDb.countPropertiesForTenant(tid)).toBe(0);
    const remainingExpenses = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.tenantId, tid));
    expect(remainingExpenses).toHaveLength(0);
    const stillUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, sid));
    expect(stillUser).toHaveLength(1);
  });

  it("manages the plan catalog (create / update / delete with in-use guard)", async () => {
    const sid = await mkUser("plan-admin", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));
    const key = `team-${Date.now()}`;

    await admin.admin.plans.create({
      key,
      name: "Team",
      isPaid: true,
      priceCents: 4900,
      currency: "ils",
      interval: "month",
      maxProperties: 5,
      maxMembers: 7,
      capabilities: ["files.upload"],
      checkoutUrl: "https://buy.example.com/team",
      sortOrder: 5,
      active: true,
    });
    let list = (await admin.admin.plans.list()).plans;
    expect(list.find(p => p.key === key)?.maxMembers).toBe(7);

    // Capabilities must come back as a real array, not the raw JSON string
    // MariaDB's LONGTEXT-backed JSON column otherwise hands back (regression).
    const seededFree = list.find(p => p.key === "free");
    expect(Array.isArray(seededFree?.capabilities)).toBe(true);
    const created = list.find(p => p.key === key);
    expect(Array.isArray(created?.capabilities)).toBe(true);
    expect(created?.capabilities).toContain("files.upload");

    await admin.admin.plans.update({
      key,
      name: "Team Plus",
      isPaid: true,
      priceCents: 5900,
      currency: "ils",
      interval: "month",
      maxProperties: 5,
      maxMembers: 9,
      capabilities: ["files.upload"],
      checkoutUrl: null,
      sortOrder: 5,
      active: true,
    });
    list = (await admin.admin.plans.list()).plans;
    expect(list.find(p => p.key === key)?.name).toBe("Team Plus");
    expect(list.find(p => p.key === key)?.maxMembers).toBe(9);

    // In-use guard: assign to a tenant, deletion must be refused.
    const tid = await tenantsDb.createTenantWithOwner(sid, "OnTeam");
    await admin.admin.billing.assignPlan({ tenantId: tid, planId: key });
    await expect(admin.admin.plans.delete({ key })).rejects.toThrow(
      /workspace\(s\) are on this plan/i
    );

    // Reassign off it, then delete succeeds.
    await admin.admin.billing.assignPlan({ tenantId: tid, planId: "free" });
    await admin.admin.plans.delete({ key });
    expect(
      (await admin.admin.plans.list()).plans.find(p => p.key === key)
    ).toBeUndefined();
  });

  it("gates capabilities by plan in SAAS and includes all in standalone", async () => {
    const sid = await mkUser("cap-owner", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const entitlements = await import("./db/entitlements");
    const tid = await tenantsDb.createTenantWithOwner(sid, "CapWs");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));

    // Standalone (the test default): everything is included regardless of plan.
    expect(await entitlements.hasCapability(tid, "files.upload")).toBe(true);
    const { CAPABILITIES } = await import("./billing/capabilities");
    expect(new Set(await entitlements.getEffectiveCapabilities(tid))).toEqual(
      new Set(CAPABILITIES.map(c => c.key))
    );
    // The tenant-facing query mirrors the resolver and reports the mode so the
    // client can hide billing UI on standalone (e.g. the HA add-on).
    const tenantCaller = appRouter.createCaller(ownerCtx(sid, tid));
    const standaloneCaps = await tenantCaller.billing.capabilities();
    expect(standaloneCaps.capabilities).toContain("data.export");
    expect(standaloneCaps.isSaas).toBe(false);

    await admin.admin.config.setAppMode({ mode: "saas" });
    try {
      expect((await tenantCaller.billing.capabilities()).isSaas).toBe(true);
      // Free plan omits files.upload → gated off in SAAS.
      await admin.admin.billing.assignPlan({ tenantId: tid, planId: "free" });
      expect(await entitlements.hasCapability(tid, "files.upload")).toBe(false);
      expect(await entitlements.hasCapability(tid, "data.export")).toBe(false);

      // Pro includes uploads / export / apartment search, but not the
      // premium notification channels.
      await admin.admin.billing.assignPlan({ tenantId: tid, planId: "pro" });
      expect(await entitlements.hasCapability(tid, "files.upload")).toBe(true);
      expect(await entitlements.hasCapability(tid, "data.export")).toBe(true);
      expect(await entitlements.hasCapability(tid, "apartment.search")).toBe(
        true
      );
      expect(
        await entitlements.hasCapability(tid, "notifications.telegram")
      ).toBe(false);

      // Unlimited adds the notification channels.
      await admin.admin.billing.assignPlan({
        tenantId: tid,
        planId: "unlimited",
      });
      expect(
        await entitlements.hasCapability(tid, "notifications.telegram")
      ).toBe(true);
      expect(
        await entitlements.hasCapability(tid, "notifications.whatsapp")
      ).toBe(true);
    } finally {
      await admin.admin.config.setAppMode({ mode: "standalone" });
    }
  });

  it("enforces a gated capability at the router boundary (notifications)", async () => {
    const sid = await mkUser("notif-gate", "superadmin");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(sid, "NotifWs");
    const admin = appRouter.createCaller(ctxFor(sid, "superadmin"));
    const caller = appRouter.createCaller(ownerCtx(sid, tid));

    // Standalone: enabling Telegram is allowed regardless of plan.
    await expect(
      caller.notification.setPref({ channel: "telegram", enabled: true })
    ).resolves.toEqual({ ok: true });

    await admin.admin.config.setAppMode({ mode: "saas" });
    try {
      await admin.admin.billing.assignPlan({ tenantId: tid, planId: "free" });
      // Free plan: enabling a gated channel is refused…
      await expect(
        caller.notification.setPref({ channel: "telegram", enabled: true })
      ).rejects.toThrow(/does not include telegram/i);
      // …but disabling it is always permitted, and in-app is never gated.
      await expect(
        caller.notification.setPref({ channel: "telegram", enabled: false })
      ).resolves.toEqual({ ok: true });
      await expect(
        caller.notification.setPref({ channel: "inapp", enabled: true })
      ).resolves.toEqual({ ok: true });

      // Unlimited unlocks it.
      await admin.admin.billing.assignPlan({
        tenantId: tid,
        planId: "unlimited",
      });
      await expect(
        caller.notification.setPref({ channel: "telegram", enabled: true })
      ).resolves.toEqual({ ok: true });
    } finally {
      await admin.admin.config.setAppMode({ mode: "standalone" });
    }
  });

  // ── User-management hardening (security review) ───────────────────────────────

  // A read-only member context, and a suspended-workspace owner context.
  const viewerCtx = (userId: number, tenantId: number) =>
    ({
      user: { id: userId, globalRole: "user" },
      propertyId: 1,
      tenantId,
      tenantRole: "viewer",
      tenantStatus: "active",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const suspendedOwnerCtx = (userId: number, tenantId: number) =>
    ({
      user: { id: userId, globalRole: "user" },
      propertyId: 1,
      tenantId,
      tenantRole: "owner",
      tenantStatus: "suspended",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  it("blocks viewers from mutations but allows reads", async () => {
    const uid = await mkUser("viewer", "user");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(uid, "VWS");
    await tenantsDb.setMemberRole(tid, uid, "viewer");
    const caller = appRouter.createCaller(viewerCtx(uid, tid));

    // A write is rejected with the view-only message…
    await expect(caller.onboarding.ensureProperty()).rejects.toThrow(
      /view-only/i
    );
    // …but a read still resolves.
    await expect(caller.tenant.list()).resolves.toBeDefined();
  });

  it("makes a suspended workspace read-only", async () => {
    const uid = await mkUser("susp-owner", "user");
    const tenantsDb = await import("./db/tenants");
    const tid = await tenantsDb.createTenantWithOwner(uid, "Suspended");
    const caller = appRouter.createCaller(suspendedOwnerCtx(uid, tid));

    await expect(caller.onboarding.ensureProperty()).rejects.toThrow(
      /suspended/i
    );
    await expect(caller.tenant.list()).resolves.toBeDefined();
  });

  it("disabling an account revokes sessions and is guarded", async () => {
    const db = await getDb();
    await db.update(schema.users).set({ globalRole: "user" });
    const actor = await mkUser("disabler", "superadmin");
    const caller = appRouter.createCaller(ctxFor(actor, "superadmin"));
    const target = await mkUser("victim", "user");

    await caller.admin.users.setStatus({ userId: target, status: "disabled" });
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, target));
    expect(row.status).toBe("disabled");
    expect(row.sessionEpoch).toBeGreaterThan(0); // sessions revoked

    // Can't disable yourself, nor the last super-admin.
    await expect(
      caller.admin.users.setStatus({ userId: actor, status: "disabled" })
    ).rejects.toThrow(/your own account/i);
  });

  it("refuses to delete the sole owner of a workspace", async () => {
    const actor = await mkUser("deleter", "superadmin");
    const caller = appRouter.createCaller(ctxFor(actor, "superadmin"));
    const tenantsDb = await import("./db/tenants");
    const victim = await mkUser("sole-owner", "user");
    await tenantsDb.createTenantWithOwner(victim, "OwnedSolely");

    await expect(
      caller.admin.users.delete({ userId: victim, confirm: true })
    ).rejects.toThrow(/only owner/i);
  });

  it("admin-resets a password and revokes the user's sessions", async () => {
    const actor = await mkUser("pw-admin", "superadmin");
    const caller = appRouter.createCaller(ctxFor(actor, "superadmin"));
    const email = `pwreset-${Date.now()}@example.com`;
    const { userId } = await caller.admin.users.create({
      email,
      password: "initialpw1",
    });

    await caller.admin.users.resetPassword({ userId, password: "brandnewpw2" });

    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(row.sessionEpoch).toBeGreaterThan(0);

    // The new password authenticates.
    await expect(
      appRouter.createCaller(anonCtx()).auth.login({
        email,
        password: "brandnewpw2",
      })
    ).resolves.toEqual({ success: true });
  });

  it("stops a tenant admin from granting or seizing ownership", async () => {
    const tenantsDb = await import("./db/tenants");
    const ownerId = await mkUser("esc-owner", "user");
    const adminId = await mkUser("esc-admin", "user");
    const memberId = await mkUser("esc-member", "user");
    const tid = await tenantsDb.createTenantWithOwner(ownerId, "Escalate");
    await tenantsDb.addMember({ tenantId: tid, userId: adminId, role: "admin" });
    await tenantsDb.addMember({
      tenantId: tid,
      userId: memberId,
      role: "member",
    });

    const adminCtx = {
      user: { id: adminId, globalRole: "user" },
      propertyId: 1,
      tenantId: tid,
      tenantRole: "admin",
      tenantStatus: "active",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    } as any;
    const caller = appRouter.createCaller(adminCtx);

    // An admin can't promote anyone to owner…
    await expect(
      caller.tenant.setMemberRole({ userId: memberId, role: "owner" })
    ).rejects.toThrow(/only an owner/i);
    // …nor demote/alter the existing owner.
    await expect(
      caller.tenant.setMemberRole({ userId: ownerId, role: "member" })
    ).rejects.toThrow(/only an owner/i);
    // …nor remove an owner.
    await expect(
      caller.tenant.removeMember({ userId: ownerId })
    ).rejects.toThrow(/only an owner/i);

    // But an admin can still manage non-owner roles.
    await expect(
      caller.tenant.setMemberRole({ userId: memberId, role: "viewer" })
    ).resolves.toEqual({ success: true });
  });

  it("binds an invite to its target email on accept", async () => {
    const tenantsDb = await import("./db/tenants");
    const { generateToken } = await import("./auth/password");
    const ownerId = await mkUser("inv-owner", "user");
    const tid = await tenantsDb.createTenantWithOwner(ownerId, "Bound");

    const tok = generateToken();
    await tenantsDb.createInvite({
      tenantId: tid,
      email: "invited@example.com",
      role: "member",
      tokenHash: tok.hash,
      invitedByUserId: ownerId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // A signed-in user whose email differs is refused.
    const wrongId = await mkUser("wrong", "user");
    const db = await getDb();
    await db
      .update(schema.users)
      .set({ email: "someone-else@example.com" })
      .where(eq(schema.users.id, wrongId));
    const wrongCtx = {
      user: { id: wrongId, email: "someone-else@example.com", globalRole: "user" },
      propertyId: 1,
      tenantId: tid,
      tenantRole: "member",
      tenantStatus: "active",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    } as any;
    await expect(
      appRouter.createCaller(wrongCtx).tenant.invites.accept({ token: tok.raw })
    ).rejects.toThrow(/different email/i);
  });

  it("enforces the email-domain allowlist on open registration", async () => {
    const adminId = await mkUser("domain-admin", "superadmin");
    const admin = appRouter.createCaller(ctxFor(adminId, "superadmin"));
    const adminDb = await import("./db/admin");
    const prevSignups = await adminDb.getSignupsEnabled();
    await adminDb.setSignupsEnabled(true);
    await admin.admin.config.setAllowedEmailDomains({ domains: ["allowed.com"] });
    try {
      // Wrong domain is refused…
      await expect(
        appRouter.createCaller(anonCtx()).auth.register({
          email: `nope-${Date.now()}@blocked.com`,
          password: "supersecret1",
        })
      ).rejects.toThrow(/email domain/i);
      // …an allowed domain goes through.
      await expect(
        appRouter.createCaller(anonCtx()).auth.register({
          email: `ok-${Date.now()}@allowed.com`,
          password: "supersecret1",
        })
      ).resolves.toEqual({ success: true });
    } finally {
      await admin.admin.config.setAllowedEmailDomains({ domains: [] });
      await adminDb.setSignupsEnabled(prevSignups);
    }
  });

  it("lets a user change their own email (requires the password)", async () => {
    const adminId = await mkUser("ce-admin", "superadmin");
    const admin = appRouter.createCaller(ctxFor(adminId, "superadmin"));
    const email = `ce-${Date.now()}@example.com`;
    const { userId } = await admin.admin.users.create({
      email,
      password: "originalpw1",
    });
    const user = { id: userId, openId: "", email, globalRole: "user" };
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    user.openId = row.openId;
    const selfCtx = {
      user,
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    } as any;
    const caller = appRouter.createCaller(selfCtx);

    // Wrong password is refused.
    await expect(
      caller.auth.changeEmail({
        currentPassword: "wrong",
        newEmail: `new-${Date.now()}@example.com`,
      })
    ).rejects.toThrow();

    const newEmail = `new-${Date.now()}@example.com`;
    await caller.auth.changeEmail({
      currentPassword: "originalpw1",
      newEmail,
    });
    const credsDb = await import("./db/credentials");
    const cred = await credsDb.getCredentialByEmail(newEmail);
    expect(cred?.userId).toBe(userId);
    expect(cred?.emailVerifiedAt).toBeNull(); // re-verification required
  });

  it("self-deletes an account and cascades its sole-owned workspace", async () => {
    const adminId = await mkUser("sd-admin", "superadmin");
    const admin = appRouter.createCaller(ctxFor(adminId, "superadmin"));
    const email = `sd-${Date.now()}@example.com`;
    const { userId } = await admin.admin.users.create({
      email,
      password: "delete-me-1",
      tenantName: "ToErase",
    });
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const tenantsDb = await import("./db/tenants");
    const owned = await tenantsDb.getTenantsForUser(userId);
    expect(owned.length).toBe(1);
    const tid = owned[0].id;

    const selfCtx = {
      user: { id: userId, openId: row.openId, email, globalRole: "user" },
      propertyId: 1,
      tenantId: tid,
      tenantRole: "owner",
      tenantStatus: "active",
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    } as any;
    const caller = appRouter.createCaller(selfCtx);

    await caller.auth.deleteMe({ confirm: true, password: "delete-me-1" });

    // The user and their sole-owned workspace are gone.
    const stillUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(stillUser).toHaveLength(0);
    expect(await tenantsDb.getTenantById(tid)).toBeUndefined();
  });
});
