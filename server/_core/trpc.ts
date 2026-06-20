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
import { performance } from "perf_hooks";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import {
  rateLimitHit,
  TENANT_MAX_REQUESTS,
  TENANT_WINDOW_MS,
} from "./rateLimit";
import {
  createLogger,
  startSpan,
  recordRequest,
  updateContext,
  shouldSampleAccessLog,
} from "./observability";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

const rpcLog = createLogger("rpc");

/**
 * Per-procedure observability: opens a child span, times the call, records RED
 * metrics, and emits a correlated log line (sampled when it's a successful
 * call, always when it errors). Folds the resolved user/tenant/route into the
 * request context so every nested log inherits them. Applied to the base
 * procedure below so every query/mutation in the app is instrumented.
 */
const observabilityMiddleware = t.middleware(
  async ({ ctx, path, type, next }) => {
    const route = `rpc:${path}`;
    updateContext({
      route,
      userId: ctx.user?.id,
      tenantId: ctx.tenantId ?? undefined,
    });
    const span = startSpan(route, {
      kind: "server",
      attributes: {
        "rpc.method": path,
        "rpc.type": type,
        route,
        user_id: ctx.user?.id,
        tenant_id: ctx.tenantId ?? undefined,
      },
    });
    const start = performance.now();
    const result = await next();
    const durationMs = performance.now() - start;
    const fields = {
      path,
      type,
      duration_ms: Math.round(durationMs),
    };

    if (result.ok) {
      span.setStatus("ok");
      if (shouldSampleAccessLog()) rpcLog.info(fields, "rpc call");
    } else {
      const code = result.error.code;
      span.setStatus("error", result.error.message);
      span.setAttribute("rpc.error_code", code);
      rpcLog.warn({ ...fields, code, err: result.error }, "rpc call failed");
    }
    span.setAttribute("rpc.ok", result.ok);
    span.end();

    recordRequest({
      transport: "rpc",
      route: path,
      method: type.toUpperCase(),
      statusCode: result.ok ? 200 : 500,
      durationMs,
      errored: !result.ok,
      tenantId: ctx.tenantId ?? undefined,
    });

    return result;
  }
);

/** Base procedure: every public/protected/admin procedure derives from this. */
const baseProcedure = t.procedure.use(observabilityMiddleware);

export const publicProcedure = baseProcedure;

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

export const protectedProcedure = baseProcedure.use(requireUser);

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
export const superAdminProcedure = baseProcedure.use(requireSuperAdmin);

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
