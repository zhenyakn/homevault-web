/**
 * Real-MySQL integration tests for switching a NO_AUTH install over to real
 * per-user (email/password) login from the admin console. Runs with NO_AUTH=true
 * (set before any import so env.ts picks it up); kept in its own file so that
 * flag doesn't affect the SAAS-mode switch test elsewhere. Skipped unless
 * TEST_DATABASE_URL is set.
 */
process.env.NO_AUTH = "true";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("NO_AUTH → user-login switch (real MySQL)", () => {
  let appRouter: typeof import("../routers").appRouter;
  let getDb: typeof import("../db/client").getDb;
  let schema: typeof import("../../drizzle/schema");
  let dbMod: typeof import("../db");

  const anonCtx = () =>
    ({
      user: null,
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const adminCtx = (userId: number) =>
    ({
      user: { id: userId, globalRole: "superadmin" },
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const mkSuperAdmin = async (label: string) => {
    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: label,
      globalRole: "superadmin",
    });
    return (res as any).insertId as number;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });
    ({ appRouter } = await import("../routers"));
    ({ getDb } = await import("../db/client"));
    schema = await import("../../drizzle/schema");
    dbMod = await import("../db");
    // Start from a known state: auto-admin active (no override).
    await dbMod.setLocalLoginEnabled(false);
  });

  afterAll(async () => {
    // Don't leave the shared test DB with user-login forced on.
    await dbMod?.setLocalLoginEnabled(false);
  });

  it("refuses to enable user login with no credentialed super-admin", async () => {
    // A super-admin inserted directly has no password credential.
    const sid = await mkSuperAdmin("lockout");
    const admin = appRouter.createCaller(adminCtx(sid));

    // Ensure the count is zero by clearing any credentials first.
    const db = await getDb();
    await db.delete(schema.userCredentials);
    expect(await dbMod.countCredentialedSuperAdmins()).toBe(0);

    await expect(
      admin.admin.config.setLocalLogin({ enabled: true })
    ).rejects.toThrow(/locked out/i);

    // Auto-admin is still the effective state, mirrored to the public flag.
    expect(await dbMod.isAutoAdminActive()).toBe(true);
    expect(
      (await appRouter.createCaller(anonCtx()).system.noAuth()).noAuth
    ).toBe(true);
  });

  it("enables user login once a super-admin has a password, then restores", async () => {
    const sid = await mkSuperAdmin("switcher");
    const admin = appRouter.createCaller(adminCtx(sid));

    // Provision a real super-admin account (creates a password credential).
    const email = `login-admin-${Date.now()}@example.com`;
    await admin.admin.users.create({
      email,
      password: "supersecret",
      globalRole: "superadmin",
    });
    expect(await dbMod.countCredentialedSuperAdmins()).toBeGreaterThanOrEqual(
      1
    );

    // Enable: the auto-admin is switched off and the public flag flips.
    await admin.admin.config.setLocalLogin({ enabled: true });
    expect(await dbMod.getLocalLoginEnabled()).toBe(true);
    expect(await dbMod.isAutoAdminActive()).toBe(false);
    expect(
      (await appRouter.createCaller(anonCtx()).system.noAuth()).noAuth
    ).toBe(false);

    // The provisioned admin can now actually sign in.
    const login = await appRouter
      .createCaller(anonCtx())
      .auth.login({ email, password: "supersecret" });
    expect(login.success).toBe(true);

    // Disable: the auto-admin resumes.
    await admin.admin.config.setLocalLogin({ enabled: false });
    expect(await dbMod.isAutoAdminActive()).toBe(true);
  });
});
