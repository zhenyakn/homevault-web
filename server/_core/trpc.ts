import {
  NOT_ADMIN_ERR_MSG,
  NOT_TENANT_ADMIN_ERR_MSG,
  NO_TENANT_ERR_MSG,
  UNAUTHED_ERR_MSG,
  VIEWER_READONLY_ERR_MSG,
  WORKSPACE_SUSPENDED_ERR_MSG,
} from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import {
  rateLimitHit,
  TENANT_MAX_REQUESTS,
  TENANT_WINDOW_MS,
} from "./rateLimit";

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
 * `superadmin`. (The owner — incl. NO_AUTH/dev — is auto-provisioned with this
 * role by `upsertUser`.)
 */
function isSuperAdmin(user: NonNullable<TrpcContext["user"]>): boolean {
  return user.globalRole === "superadmin";
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

  // Per-tenant rate limit: a single workspace can't monopolise the instance.
  if (ENV.rateLimitEnabled) {
    const { allowed } = rateLimitHit(
      `tenant:${ctx.tenantId}`,
      TENANT_MAX_REQUESTS,
      TENANT_WINDOW_MS
    );
    if (!allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "This workspace is making too many requests. Please slow down.",
      });
    }
  }

  // Write-time authorization, applied to *mutations* only so reads stay open to
  // every member (including viewers and members of a suspended workspace, who
  // can still view/export their data):
  //  - `viewer` members are read-only.
  //  - a `suspended` workspace is read-only until a super-admin reactivates it.
  // This lives in tenantProcedure (rather than a separate procedure swapped in
  // at 100+ call sites) so every tenant-scoped mutation is guarded by default;
  // the only legitimate viewer-writable mutations (a member editing their own
  // profile/language) deliberately use `protectedProcedure` instead.
  if (opts.type === "mutation") {
    if (ctx.tenantRole === "viewer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: VIEWER_READONLY_ERR_MSG,
      });
    }
    if (ctx.tenantStatus === "suspended") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: WORKSPACE_SUSPENDED_ERR_MSG,
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId,
      tenantRole: ctx.tenantRole,
    },
  });
});

/**
 * Alias of {@link tenantProcedure} kept for call-site clarity: use it for
 * entity-mutating procedures to signal "this is a guarded write". The actual
 * viewer / suspended-workspace enforcement happens in tenantProcedure's
 * mutation guard above.
 */
export const writeProcedure = tenantProcedure;

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
