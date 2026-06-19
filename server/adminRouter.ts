import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, superAdminProcedure } from "./_core/trpc";
import { ENV } from "./_core/env";
import { clearNoAuthUserCache } from "./_core/context";
import * as db from "./db";
import { hashPassword } from "./auth/password";
import { EMAIL_TAKEN_ERR_MSG } from "../shared/const";
import { CAPABILITIES, sanitizeCapabilities } from "./billing/capabilities";
import { purgeTenantFileObjects } from "./files";

const planInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isPaid: z.boolean(),
  priceCents: z.number().int().min(0).max(100_000_00),
  currency: z.string().trim().length(3),
  interval: z.enum(["month", "year", "none"]),
  maxProperties: z.number().int().min(0).max(100000).nullable(),
  maxMembers: z.number().int().min(1).max(100000).nullable(),
  capabilities: z.array(z.string()),
  checkoutUrl: z.string().trim().max(1024).url().nullable(),
  sortOrder: z.number().int().min(0).max(10000),
  active: z.boolean(),
});

/**
 * Server-wide admin console. Every procedure is gated by superAdminProcedure
 * (users.globalRole === 'superadmin', or the legacy role === 'admin' during the
 * transition). Distinct from per-tenant admin (tenantAdminProcedure).
 */
export const adminRouter = router({
  stats: superAdminProcedure.query(async () => {
    const stats = await db.getServerStats();
    return { ...stats, appMode: await db.getAppMode() };
  }),

  users: router({
    list: superAdminProcedure
      .input(
        z
          .object({
            search: z.string().optional(),
            limit: z.number().int().min(1).max(200).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.listUsersForAdmin(input ?? {});
      }),

    // Directly provision a user with an email + password. This is the
    // standalone counterpart to SAAS self-registration: standalone installs
    // keep open signups off and may have no SMTP for invite links, so an admin
    // needs a way to create accounts by hand. The account is created
    // pre-verified (the admin vouches for it) so the email-verification gate
    // never locks the new user out, and it lands in its own workspace — a named
    // one if `tenantName` is given, otherwise a personal "<name>'s Home".
    create: superAdminProcedure
      .input(
        z.object({
          email: z.string().trim().toLowerCase().email().max(320),
          password: z.string().min(8).max(200),
          name: z.string().trim().min(1).max(100).optional(),
          globalRole: z.enum(["user", "superadmin"]).default("user"),
          tenantName: z.string().trim().min(1).max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (await db.getCredentialByEmail(input.email)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: EMAIL_TAKEN_ERR_MSG,
          });
        }

        const openId = `local:${nanoid()}`;
        const name = input.name ?? input.email.split("@")[0];
        await db.upsertUser({
          openId,
          name,
          email: input.email,
          loginMethod: "email",
          globalRole: input.globalRole,
          lastSignedIn: new Date(),
        });
        const user = await db.getUserByOpenId(openId);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }

        await db.createCredential({
          userId: user.id,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        });
        // Admin-created accounts skip email verification — the admin is the
        // authorization, and standalone installs may not have SMTP configured.
        await db.markEmailVerified(user.id);

        // Give the new user a workspace to land in.
        if (input.tenantName) {
          const tenantId = await db.createTenantWithOwner(
            user.id,
            input.tenantName
          );
          await db.setUserDefaultTenant(user.id, tenantId);
        } else {
          await db.ensurePersonalTenant(user.id, name);
        }

        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.created",
          targetType: "user",
          targetId: String(user.id),
          metadata: { email: input.email, globalRole: input.globalRole },
        });
        return { success: true as const, userId: user.id };
      }),

    // Grant or revoke server-wide super-admin. Can't demote the last one.
    setGlobalRole: superAdminProcedure
      .input(
        z.object({
          userId: z.number().int(),
          globalRole: z.enum(["user", "superadmin"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const target = await db.getUserById(input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (
          input.globalRole === "user" &&
          target.globalRole === "superadmin" &&
          (await db.countSuperAdmins()) <= 1
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last super-admin",
          });
        }
        await db.setUserGlobalRole(input.userId, input.globalRole);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.role_changed",
          targetType: "user",
          targetId: String(input.userId),
          metadata: { globalRole: input.globalRole },
        });
        return { success: true as const };
      }),

    // Edit a user's display name.
    update: superAdminProcedure
      .input(
        z.object({
          userId: z.number().int(),
          name: z.string().trim().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const target = await db.getUserById(input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        await db.upsertUser({ openId: target.openId, name: input.name });
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.updated",
          targetType: "user",
          targetId: String(input.userId),
        });
        return { success: true as const };
      }),

    // Enable / disable an account. Disabling revokes every active session and
    // locks out sign-in. Can't disable yourself or the last active super-admin.
    setStatus: superAdminProcedure
      .input(
        z.object({
          userId: z.number().int(),
          status: z.enum(["active", "disabled"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const target = await db.getUserById(input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (input.status === "disabled") {
          if (input.userId === ctx.user.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You can't disable your own account",
            });
          }
          if (
            target.globalRole === "superadmin" &&
            (await db.countSuperAdmins()) <= 1
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot disable the last super-admin",
            });
          }
        }
        await db.setUserStatus(input.userId, input.status);
        if (input.status === "disabled") {
          // Kill existing sessions immediately, not just future sign-ins.
          await db.bumpSessionEpoch(input.userId);
        }
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.status_changed",
          targetType: "user",
          targetId: String(input.userId),
          metadata: { status: input.status },
        });
        return { success: true as const };
      }),

    // Set a new password for a user (admin-initiated reset). Revokes existing
    // sessions. The user must already have a local credential.
    resetPassword: superAdminProcedure
      .input(
        z.object({
          userId: z.number().int(),
          password: z.string().min(8).max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const cred = await db.getCredentialByUserId(input.userId);
        if (!cred) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This account has no email/password credential to reset",
          });
        }
        await db.setPasswordHash(input.userId, await hashPassword(input.password));
        await db.bumpSessionEpoch(input.userId);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.password_reset",
          targetType: "user",
          targetId: String(input.userId),
        });
        return { success: true as const };
      }),

    // Hard-delete a user. Refuses when it would strand a workspace (sole owner)
    // or remove the last super-admin; the admin must fix those first. Confirm-
    // gated. Data the user authored stays with its tenant.
    delete: superAdminProcedure
      .input(z.object({ userId: z.number().int(), confirm: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const target = await db.getUserById(input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can't delete your own account",
          });
        }
        if (
          target.globalRole === "superadmin" &&
          (await db.countSuperAdmins()) <= 1
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete the last super-admin",
          });
        }
        const stranded = await db.getSoleOwnerTenantIds(input.userId);
        if (stranded.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This user is the only owner of one or more workspaces. Transfer ownership or delete those workspaces first.",
          });
        }
        await db.deleteUserAccount(input.userId);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.user.deleted",
          targetType: "user",
          targetId: String(input.userId),
          metadata: { email: target.email },
        });
        return { success: true as const };
      }),
  }),

  tenants: router({
    list: superAdminProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(200).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.listTenantsForAdmin(input ?? {});
      }),

    // Suspend / reactivate a tenant.
    setStatus: superAdminProcedure
      .input(
        z.object({
          tenantId: z.number().int(),
          status: z.enum(["active", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.setTenantStatus(input.tenantId, input.status);
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: input.tenantId,
          action: "admin.tenant.status_changed",
          targetType: "tenant",
          targetId: String(input.tenantId),
          metadata: { status: input.status },
        });
        return { success: true as const };
      }),

    // Members of a specific tenant (for drill-in).
    members: superAdminProcedure
      .input(z.object({ tenantId: z.number().int() }))
      .query(async ({ input }) => {
        return db.getMembersOfTenant(input.tenantId);
      }),

    // GDPR data portability: full export of a tenant's data (admin).
    export: superAdminProcedure
      .input(z.object({ tenantId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const data = await db.exportTenantData(input.tenantId);
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: input.tenantId,
          action: "admin.tenant.exported",
          targetType: "tenant",
          targetId: String(input.tenantId),
        });
        return data;
      }),

    // GDPR erasure: hard-delete a tenant and everything scoped to it. Requires
    // an explicit confirm flag; users (who may belong to other tenants) are not
    // deleted, only their membership here.
    delete: superAdminProcedure
      .input(z.object({ tenantId: z.number().int(), confirm: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const tenant = await db.getTenantById(input.tenantId);
        if (!tenant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workspace not found",
          });
        }
        // Remove the stored binary objects first (best-effort), then the DB rows.
        await purgeTenantFileObjects(input.tenantId);
        await db.deleteTenantCascade(input.tenantId);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.tenant.deleted",
          targetType: "tenant",
          targetId: String(input.tenantId),
          metadata: { name: tenant.name },
        });
        return { success: true as const };
      }),

    // Set per-tenant quotas. null clears a limit (unlimited).
    setLimits: superAdminProcedure
      .input(
        z.object({
          tenantId: z.number().int(),
          maxProperties: z.number().int().min(0).max(100000).nullable(),
          maxMembers: z.number().int().min(1).max(100000).nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.setTenantLimits(input.tenantId, {
          maxProperties: input.maxProperties,
          maxMembers: input.maxMembers,
        });
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: input.tenantId,
          action: "admin.tenant.limits_changed",
          targetType: "tenant",
          targetId: String(input.tenantId),
          metadata: {
            maxProperties: input.maxProperties,
            maxMembers: input.maxMembers,
          },
        });
        return { success: true as const };
      }),
  }),

  // ── Plan management (admin-defined catalog) ──────────────────────────────────
  plans: router({
    // The full plan catalog + the code-defined capability registry (so the UI
    // can render capability checkboxes) + the active billing provider.
    list: superAdminProcedure.query(async () => ({
      provider: ENV.billingProvider,
      capabilities: CAPABILITIES,
      plans: await db.listPlans(),
    })),

    create: superAdminProcedure
      .input(planInputSchema.extend({ key: z.string().trim().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        if (await db.getPlanByKey(input.key)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A plan with this key already exists",
          });
        }
        await db.createPlan({
          ...input,
          capabilities: sanitizeCapabilities(input.capabilities),
        });
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.plan.created",
          targetType: "plan",
          targetId: input.key,
        });
        return { success: true as const };
      }),

    update: superAdminProcedure
      .input(planInputSchema.extend({ key: z.string().trim().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const { key, ...rest } = input;
        if (!(await db.getPlanByKey(key))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
        }
        await db.updatePlan(key, {
          ...rest,
          capabilities: sanitizeCapabilities(input.capabilities),
        });
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.plan.updated",
          targetType: "plan",
          targetId: key,
        });
        return { success: true as const };
      }),

    delete: superAdminProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const inUse = await db.countSubscribersOfPlan(input.key);
        if (inUse > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot delete: ${inUse} workspace(s) are on this plan. Reassign them first.`,
          });
        }
        await db.deletePlan(input.key);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.plan.deleted",
          targetType: "plan",
          targetId: input.key,
        });
        return { success: true as const };
      }),
  }),

  billing: router({
    // The plan catalog + the active provider id (kept for the Tenants tab's
    // plan selector).
    plans: superAdminProcedure.query(async () => ({
      provider: ENV.billingProvider,
      plans: await db.listPlans(),
    })),

    // Assign a plan to a tenant. Applies the plan's limits to the tenant's
    // quotas (the enforcement source of truth). With the stub provider this is
    // the primary way plans are set; real providers also funnel through
    // db.applyPlan from their webhooks.
    assignPlan: superAdminProcedure
      .input(
        z.object({
          tenantId: z.number().int(),
          planId: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!(await db.getPlanByKey(input.planId))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan" });
        }
        await db.applyPlan(input.tenantId, input.planId, {
          provider: ENV.billingProvider,
        });
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: input.tenantId,
          action: "admin.tenant.plan_assigned",
          targetType: "tenant",
          targetId: String(input.tenantId),
          metadata: { planId: input.planId },
        });
        return { success: true as const };
      }),
  }),

  audit: router({
    list: superAdminProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(500).optional() })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getRecentAudit(input?.limit ?? 100);
      }),
  }),

  config: router({
    get: superAdminProcedure.query(async () => {
      return {
        appMode: await db.getAppMode(),
        // The compile-time env default, shown alongside the live (possibly
        // overridden) mode so the admin can see what a restart would revert to.
        appModeEnvDefault: ENV.appMode,
        noAuth: ENV.noAuth,
        // Whether this NO_AUTH install has been switched to real per-user login,
        // plus how many super-admins could actually sign in afterwards (the
        // lockout guard surfaced in the UI).
        localLoginEnabled: await db.getLocalLoginEnabled(),
        credentialedSuperAdmins: await db.countCredentialedSuperAdmins(),
        signupsEnabled: await db.getSignupsEnabled(),
        requireEmailVerification: await db.getRequireEmailVerification(),
        emailVerificationGraceHours: await db.getEmailVerificationGraceHours(),
      };
    }),

    // Switch a NO_AUTH install between the single auto-admin (admin@local, no
    // login screen) and real per-user email/password login. Guarded so enabling
    // login can't lock everyone out: at least one super-admin must already have a
    // password credential. Clears the cached auto-admin resolution so the change
    // takes effect on the next request.
    setLocalLogin: superAdminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (!ENV.noAuth) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This install already uses session login (NO_AUTH is off); there is no auto-admin to switch.",
          });
        }
        if (input.enabled && (await db.countCredentialedSuperAdmins()) < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Create a super-admin with an email and password first (Users → New user), or you'd be locked out.",
          });
        }
        await db.setLocalLoginEnabled(input.enabled);
        clearNoAuthUserCache();
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.config.local_login",
          metadata: { enabled: input.enabled },
        });
        return { success: true as const };
      }),

    // Switch deployment mode at runtime (app_settings override). SAAS requires
    // authenticated, tenant-scoped requests, so it's incompatible with NO_AUTH —
    // refuse the switch rather than boot into a broken state on next restart.
    setAppMode: superAdminProcedure
      .input(z.object({ mode: z.enum(["standalone", "saas"]) }))
      .mutation(async ({ ctx, input }) => {
        if (input.mode === "saas" && ENV.noAuth) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Cannot switch to SAAS while NO_AUTH is enabled — SAAS requires every request to be an authenticated, tenant-scoped user.",
          });
        }
        await db.setAppMode(input.mode);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.config.app_mode",
          metadata: { mode: input.mode },
        });
        return { success: true as const };
      }),

    // Toggle open (un-invited) self-registration. Invited users can always join.
    setSignupsEnabled: superAdminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await db.setSignupsEnabled(input.enabled);
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.config.signups",
          metadata: { enabled: input.enabled },
        });
        return { success: true as const };
      }),

    // Require email verification before sign-in, with an optional grace window
    // (hours from account creation) during which unverified users may still log
    // in. Grace is clamped to >= 0.
    setEmailVerification: superAdminProcedure
      .input(
        z.object({
          required: z.boolean(),
          graceHours: z.number().int().min(0).max(8760).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.setRequireEmailVerification(input.required);
        if (input.graceHours !== undefined) {
          await db.setEmailVerificationGraceHours(input.graceHours);
        }
        await db.logAudit({
          actorUserId: ctx.user.id,
          action: "admin.config.email_verification",
          metadata: { required: input.required, graceHours: input.graceHours },
        });
        return { success: true as const };
      }),
  }),
});
