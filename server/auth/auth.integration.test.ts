/**
 * Real-MySQL integration tests for the native email/password auth flow.
 * Skipped unless TEST_DATABASE_URL points at a throwaway MySQL:
 *
 *   TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/homevault_test pnpm test
 *
 * Covers register → login → verify-email → password-reset, plus the
 * account-enumeration and duplicate-email guards. SMTP is unconfigured in the
 * test env, so verification/reset emails are skipped (best-effort) and we drive
 * the flows with the raw tokens read back from the email_tokens table.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and, desc } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("native auth flow (real MySQL)", () => {
  let appRouter: typeof import("../routers").appRouter;
  let getDb: typeof import("../db/client").getDb;
  let schema: typeof import("../../drizzle/schema");
  let password: typeof import("./password");

  // Minimal anonymous context (no user) with a cookie-capturing res.
  const anonCtx = () => {
    const cookies: Record<string, string> = {};
    return {
      ctx: {
        user: null,
        propertyId: 1,
        tenantId: null,
        tenantRole: null,
        req: { headers: {}, protocol: "https" },
        res: {
          cookie: (name: string, value: string) => {
            cookies[name] = value;
          },
          clearCookie: () => {},
        },
      } as any,
      cookies,
    };
  };

  const latestToken = async (userId: number, type: string) => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.emailTokens)
      .where(
        and(
          eq(schema.emailTokens.userId, userId),
          eq(schema.emailTokens.type, type as any)
        )
      )
      .orderBy(desc(schema.emailTokens.id))
      .limit(1);
    return rows[0];
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });
    ({ appRouter } = await import("../routers"));
    ({ getDb } = await import("../db/client"));
    schema = await import("../../drizzle/schema");
    password = await import("./password");
    // Standalone (the test default) keeps open signups off; these tests exercise
    // the self-registration path, so opt in explicitly.
    await (await import("../db/admin")).setSignupsEnabled(true);
  });

  it("registers a user, provisions a tenant, and sets a session cookie", async () => {
    const email = `reg-${Date.now()}@example.com`;
    const { ctx, cookies } = anonCtx();
    const res = await appRouter.createCaller(ctx).auth.register({
      email,
      password: "supersecret1",
      name: "Reg User",
    });
    expect(res.success).toBe(true);
    // A session cookie was issued.
    expect(Object.keys(cookies).length).toBe(1);

    const db = await getDb();
    const cred = await (
      await import("../db/credentials")
    ).getCredentialByEmail(email);
    expect(cred).toBeTruthy();
    // Password is stored hashed, never in clear text.
    expect(cred!.passwordHash).not.toContain("supersecret1");

    // A user + an owner tenant membership exist.
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, cred!.userId));
    expect(user.loginMethod).toBe("email");
    expect(user.openId.startsWith("local:")).toBe(true);
    const tenants = await (
      await import("../db/tenants")
    ).getTenantsForUser(cred!.userId);
    expect(tenants).toHaveLength(1);
    expect(tenants[0].role).toBe("owner");
  });

  it("rejects duplicate email registration", async () => {
    const email = `dup-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx().ctx)
      .auth.register({ email, password: "supersecret1" });
    await expect(
      appRouter
        .createCaller(anonCtx().ctx)
        .auth.register({ email, password: "supersecret1" })
    ).rejects.toThrow(/already exists/i);
  });

  it("logs in with correct password, rejects wrong password and unknown email", async () => {
    const email = `login-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx().ctx)
      .auth.register({ email, password: "rightpassword1" });

    const { ctx, cookies } = anonCtx();
    const ok = await appRouter
      .createCaller(ctx)
      .auth.login({ email, password: "rightpassword1" });
    expect(ok.success).toBe(true);
    expect(Object.keys(cookies).length).toBe(1);

    await expect(
      appRouter
        .createCaller(anonCtx().ctx)
        .auth.login({ email, password: "wrongpassword" })
    ).rejects.toThrow(/invalid email or password/i);

    await expect(
      appRouter
        .createCaller(anonCtx().ctx)
        .auth.login({ email: "nobody@example.com", password: "whatever" })
    ).rejects.toThrow(/invalid email or password/i);
  });

  it("verifies email via a single-use token", async () => {
    const email = `verify-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx().ctx)
      .auth.register({ email, password: "supersecret1" });
    const cred = await (
      await import("../db/credentials")
    ).getCredentialByEmail(email);

    const tokenRow = await latestToken(cred!.userId, "verify_email");
    expect(tokenRow).toBeTruthy();
    // Re-derive a raw token whose hash matches by storing a known one.
    const known = password.generateToken();
    const db = await getDb();
    await db
      .update(schema.emailTokens)
      .set({ tokenHash: known.hash })
      .where(eq(schema.emailTokens.id, tokenRow.id));

    const out = await appRouter
      .createCaller(anonCtx().ctx)
      .auth.verifyEmail({ token: known.raw });
    expect(out.success).toBe(true);

    const after = await (
      await import("../db/credentials")
    ).getCredentialByUserId(cred!.userId);
    expect(after!.emailVerifiedAt).toBeTruthy();

    // Token is single-use: a second attempt fails.
    await expect(
      appRouter
        .createCaller(anonCtx().ctx)
        .auth.verifyEmail({ token: known.raw })
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it("resets a password via a single-use token and the new password works", async () => {
    const email = `reset-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx().ctx)
      .auth.register({ email, password: "oldpassword1" });
    const creds = await import("../db/credentials");
    const cred = await creds.getCredentialByEmail(email);

    // requestPasswordReset always succeeds (no enumeration).
    const reqOut = await appRouter
      .createCaller(anonCtx().ctx)
      .auth.requestPasswordReset({ email });
    expect(reqOut.success).toBe(true);
    const unknownOut = await appRouter
      .createCaller(anonCtx().ctx)
      .auth.requestPasswordReset({ email: "ghost@example.com" });
    expect(unknownOut.success).toBe(true);

    const tokenRow = await latestToken(cred!.userId, "reset_password");
    const known = password.generateToken();
    const db = await getDb();
    await db
      .update(schema.emailTokens)
      .set({ tokenHash: known.hash })
      .where(eq(schema.emailTokens.id, tokenRow.id));

    const out = await appRouter
      .createCaller(anonCtx().ctx)
      .auth.resetPassword({ token: known.raw, password: "newpassword1" });
    expect(out.success).toBe(true);

    // Old password no longer works; new one does.
    await expect(
      appRouter
        .createCaller(anonCtx().ctx)
        .auth.login({ email, password: "oldpassword1" })
    ).rejects.toThrow();
    const ok = await appRouter
      .createCaller(anonCtx().ctx)
      .auth.login({ email, password: "newpassword1" });
    expect(ok.success).toBe(true);
  });

  it("blocks unverified sign-in when verification is required (strict), then allows it after verifying", async () => {
    const adminDb = await import("../db/admin");
    const creds = await import("../db/credentials");
    const email = `gate-${Date.now()}@example.com`;
    await appRouter
      .createCaller(anonCtx().ctx)
      .auth.register({ email, password: "supersecret1" });

    // Enforce verification with no grace window. Restore afterwards so sibling
    // tests (and re-runs) see the relaxed standalone default again.
    await adminDb.setRequireEmailVerification(true);
    await adminDb.setEmailVerificationGraceHours(0);
    try {
      await expect(
        appRouter
          .createCaller(anonCtx().ctx)
          .auth.login({ email, password: "supersecret1" })
      ).rejects.toThrow(/verify your email/i);

      // resendVerification reports success regardless (no enumeration).
      const resent = await appRouter
        .createCaller(anonCtx().ctx)
        .auth.resendVerification({ email });
      expect(resent.success).toBe(true);

      // Mark verified, then login succeeds.
      const cred = await creds.getCredentialByEmail(email);
      await creds.markEmailVerified(cred!.userId);
      const ok = await appRouter
        .createCaller(anonCtx().ctx)
        .auth.login({ email, password: "supersecret1" });
      expect(ok.success).toBe(true);
    } finally {
      await adminDb.setRequireEmailVerification(false);
    }
  });
});
