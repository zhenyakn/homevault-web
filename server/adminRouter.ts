import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superAdminProcedure } from "./_core/trpc";
import { ENV } from "./_core/env";
import * as db from "./db";

/**
 * Server-wide admin console. Every procedure is gated by superAdminProcedure
 * (users.globalRole === 'superadmin', or the legacy role === 'admin' during the
 * transition). Distinct from per-tenant admin (tenantAdminProcedure).
 */
export const adminRouter = router({
  stats: superAdminProcedure.query(async () => {
    const stats = await db.getServerStats();
    return { ...stats, appMode: ENV.appMode };
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
        appMode: ENV.appMode,
        noAuth: ENV.noAuth,
        signupsEnabled: await db.getSignupsEnabled(),
      };
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
  }),
});
