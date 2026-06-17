/**
 * Real-MySQL integration tests for the registration flow + invites:
 *   - register creating a brand-new named tenant
 *   - invite (admin) → accept by a brand-new user via register(inviteToken)
 *   - invite → accept by an existing signed-in user via tenant.invites.accept
 *   - public inviteInfo preview
 *
 * Skipped unless TEST_DATABASE_URL is set. SMTP is unconfigured so invite
 * emails are skipped; tests overwrite the stored token hash with a known token
 * to drive acceptance (the raw token never leaves the email otherwise).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, desc } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("registration flow + invites (real MySQL)", () => {
  let appRouter: typeof import("../routers").appRouter;
  let getDb: typeof import("../db/client").getDb;
  let schema: typeof import("../../drizzle/schema");
  let tenantsDb: typeof import("../db/tenants");
  let creds: typeof import("../db/credentials");
  let password: typeof import("./password");

  const anonCtx = () =>
    ({
      user: null,
      propertyId: 1,
      tenantId: null,
      tenantRole: null,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  const userCtx = (userId: number, tenantId: number, role: string) =>
    ({
      user: { id: userId, role: "user", globalRole: "user" },
      propertyId: 1,
      tenantId,
      tenantRole: role,
      req: { headers: {}, protocol: "https" },
      res: { cookie: () => {}, clearCookie: () => {} },
    }) as any;

  // Create an invite and return a known raw token for it (overwrites the stored
  // hash, since the real raw token is only ever emailed).
  const createInviteWithToken = async (
    adminUserId: number,
    tenantId: number,
    email: string,
    role: "admin" | "member" | "viewer"
  ) => {
    await appRouter
      .createCaller(userCtx(adminUserId, tenantId, "owner"))
      .tenant.invites.create({ email, role });
    const db = await getDb();
    const [row] = await db
      .select()
      .from(schema.tenantInvites)
      .where(eq(schema.tenantInvites.tenantId, tenantId))
      .orderBy(desc(schema.tenantInvites.id))
      .limit(1);
    const known = password.generateToken();
    await db
      .update(schema.tenantInvites)
      .set({ tokenHash: known.hash })
      .where(eq(schema.tenantInvites.id, row.id));
    return { inviteId: row.id, token: known.raw };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });
    ({ appRouter } = await import("../routers"));
    ({ getDb } = await import("../db/client"));
    schema = await import("../../drizzle/schema");
    tenantsDb = await import("../db/tenants");
    creds = await import("../db/credentials");
    password = await import("./password");
  });

  it("register with a tenantName creates that named tenant (owner)", async () => {
    const email = `newtenant-${Date.now()}@example.com`;
    await appRouter.createCaller(anonCtx()).auth.register({
      email,
      password: "supersecret",
      tenantName: "The Smith Household",
    });
    const cred = await creds.getCredentialByEmail(email);
    const tenants = await tenantsDb.getTenantsForUser(cred!.userId);
    expect(tenants).toHaveLength(1);
    expect(tenants[0].name).toBe("The Smith Household");
    expect(tenants[0].role).toBe("owner");
  });

  it("a new user joins an existing tenant via register(inviteToken)", async () => {
    // Owner with a tenant.
    const ownerEmail = `owner-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx())
      .auth.register({
        email: ownerEmail,
        password: "supersecret",
        tenantName: "Shared Co",
      });
    const owner = await creds.getCredentialByEmail(ownerEmail);
    const tenantId = (await tenantsDb.getTenantsForUser(owner!.userId))[0].id;

    // Owner invites a member; new user registers with the token.
    const inviteeEmail = `invitee-${Date.now()}@example.com`;
    const { token } = await createInviteWithToken(
      owner!.userId,
      tenantId,
      inviteeEmail,
      "member"
    );

    await appRouter.createCaller(anonCtx()).auth.register({
      email: inviteeEmail,
      password: "supersecret",
      inviteToken: token,
    });

    const invitee = await creds.getCredentialByEmail(inviteeEmail);
    const tenants = await tenantsDb.getTenantsForUser(invitee!.userId);
    // The invitee is a MEMBER of the owner's tenant — and was NOT given a
    // separate personal tenant.
    expect(tenants).toHaveLength(1);
    expect(tenants[0].id).toBe(tenantId);
    expect(tenants[0].role).toBe("member");

    // The invite is now consumed (single-use): registering again with it fails.
    await expect(
      appRouter.createCaller(anonCtx()).auth.register({
        email: `late-${Date.now()}@example.com`,
        password: "supersecret",
        inviteToken: token,
      })
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it("an existing signed-in user accepts an invite via tenant.invites.accept", async () => {
    const ownerEmail = `owner2-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx())
      .auth.register({
        email: ownerEmail,
        password: "supersecret",
        tenantName: "Team Two",
      });
    const owner = await creds.getCredentialByEmail(ownerEmail);
    const tenantId = (await tenantsDb.getTenantsForUser(owner!.userId))[0].id;

    // An existing user with their own tenant.
    const joinerEmail = `joiner-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx())
      .auth.register({ email: joinerEmail, password: "supersecret" });
    const joiner = await creds.getCredentialByEmail(joinerEmail);

    const { token } = await createInviteWithToken(
      owner!.userId,
      tenantId,
      joinerEmail,
      "admin"
    );

    // Public preview works before accepting.
    const info = await appRouter
      .createCaller(anonCtx())
      .tenant.inviteInfo({ token });
    expect(info?.tenantName).toBe("Team Two");
    expect(info?.role).toBe("admin");

    const joinerActive = await tenantsDb.resolveActiveTenant(
      joiner!.userId,
      {}
    );
    const res = await appRouter
      .createCaller(userCtx(joiner!.userId, joinerActive.tenantId, "owner"))
      .tenant.invites.accept({ token });
    expect(res.tenantId).toBe(tenantId);

    // Joiner now belongs to both their own tenant and Team Two (as admin).
    const tenants = await tenantsDb.getTenantsForUser(joiner!.userId);
    expect(tenants.map(t => t.id)).toContain(tenantId);
    expect(tenants.find(t => t.id === tenantId)?.role).toBe("admin");
  });
});
