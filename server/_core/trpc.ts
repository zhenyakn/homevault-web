import {
  NOT_ADMIN_ERR_MSG,
  NOT_TENANT_ADMIN_ERR_MSG,
  NO_TENANT_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * A logged-in user is a server-wide super-admin when their `globalRole` is
 * `superadmin`. The legacy `role === 'admin'` is accepted during the
 * transition (e.g. the NO_AUTH owner, whose globalRole isn't set explicitly).
 */
function isSuperAdmin(user: NonNullable<TrpcContext["user"]>): boolean {
  return user.globalRole === "superadmin" || user.role === "admin";
}

const requireSuperAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user || !isSuperAdmin(ctx.user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Server-wide admin console. Replaces the legacy `adminProcedure`. */
export const superAdminProcedure = t.procedure.use(requireSuperAdmin);

/**
 * Deprecated alias kept so existing call sites keep working during the
 * multi-tenant transition. Prefer `superAdminProcedure` (server-wide) or
 * `tenantAdminProcedure` (within a tenant).
 */
export const adminProcedure = superAdminProcedure;

/**
 * Requires an authenticated user with a resolved active tenant. Narrows
 * `tenantId`/`tenantRole` to non-null so downstream resolvers can rely on them.
 */
export const tenantProcedure = protectedProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (ctx.tenantId == null || ctx.tenantRole == null) {
    throw new TRPCError({ code: "FORBIDDEN", message: NO_TENANT_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
      tenantRole: ctx.tenantRole,
    },
  });
});

/** Requires the active tenant role to be owner or admin (manage members/settings). */
export const tenantAdminProcedure = tenantProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (ctx.tenantRole !== "owner" && ctx.tenantRole !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NOT_TENANT_ADMIN_ERR_MSG,
    });
  }

  return next({ ctx });
});
