import { router, tenantProcedure, tenantAdminProcedure } from "./_core/trpc";
import * as db from "./db";

/**
 * Tenant/workspace endpoints. Stage 1 exposes read-only surface so the client
 * can show the active tenant and (later) a switcher; member-management
 * mutations land with the in-app tenant settings UI in a later phase.
 */
export const tenantRouter = router({
  // The tenants the current user belongs to, with their role in each.
  list: tenantProcedure.query(async ({ ctx }) => {
    return db.getTenantsForUser(ctx.user.id);
  }),

  // The tenant the current request resolved to.
  current: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await db.getTenantById(ctx.tenantId);
    return tenant ? { ...tenant, role: ctx.tenantRole } : null;
  }),

  // Members of the active tenant. Owner/admin only.
  members: tenantAdminProcedure.query(async ({ ctx }) => {
    return db.getMembersOfTenant(ctx.tenantId);
  }),
});
