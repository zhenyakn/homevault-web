import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { TenantRole } from "../db/tenants";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  propertyId: number;
  // The tenant this request operates in, and the user's role within it. Null
  // only when there is no authenticated user. tenantProcedure narrows these to
  // non-null. (Property scoping still flows through propertyId today; switching
  // it to be tenant-scoped happens in Phase 3.)
  tenantId: number | null;
  tenantRole: TenantRole | null;
  // Status of the active tenant. A `suspended` workspace is read-only-blocked
  // by tenantProcedure (its members can't operate until reactivated).
  tenantStatus: "active" | "suspended" | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // NO_AUTH mode: treat the owner as logged-in — unless the admin has switched
  // this install over to real per-user login, in which case we fall through to
  // normal session-cookie auth below. Resolved once (cached) per request.
  const autoAdmin = await autoAdminActive();
  if (autoAdmin) {
    const openId = ENV.ownerOpenId || "owner";

    // Cache the upsert so it only runs once per server process, not per request.
    // The _noAuthUserCache is intentionally module-scoped.
    if (!_noAuthUserCache) {
      await db.upsertUser({
        openId,
        name: "HomeVault Admin",
        email: "admin@local",
        globalRole: "superadmin",
        lastSignedIn: new Date(),
      });
      _noAuthUserCache = (await db.getUserByOpenId(openId)) ?? null;
    }
    user = _noAuthUserCache;
  } else {
    // Normal behavior: authenticate via session cookie / OAuth
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }

  // Resolve the active tenant for the logged-in user. The x-tenant-id header
  // (sent by the client, mirroring x-property-id) is only honoured when the
  // user is an active member; otherwise we fall back to their default / first
  // tenant. Users with no membership get a personal tenant provisioned.
  let tenantId: number | null = null;
  let tenantRole: TenantRole | null = null;
  let tenantStatus: "active" | "suspended" | null = null;

  if (user) {
    if (autoAdmin && _noAuthTenantCache) {
      tenantId = _noAuthTenantCache.tenantId;
      tenantRole = _noAuthTenantCache.role;
      tenantStatus = _noAuthTenantCache.status;
    } else {
      const requestedTenantId = parseHeaderId(opts.req.headers["x-tenant-id"]);
      const active = await db.resolveActiveTenant(user.id, {
        requestedTenantId,
        defaultTenantId: user.defaultTenantId,
        displayName: user.name,
      });
      tenantId = active.tenantId;
      tenantRole = active.role;
      tenantStatus = active.status;
      // NO_AUTH is single-user/single-tenant; cache to avoid per-request work.
      if (autoAdmin) _noAuthTenantCache = active;
    }
  }

  // Resolve propertyId from the request header, then validate it belongs to the
  // active tenant. This prevents a member of one tenant from operating on a
  // property in another tenant by spoofing the x-property-id header.
  const rawPropertyId = opts.req.headers["x-property-id"];
  const requestedId = rawPropertyId
    ? parseInt(rawPropertyId as string, 10) || 1
    : 1;

  let propertyId = requestedId;

  if (user && tenantId != null) {
    const inTenant = await db.checkPropertyInTenant(tenantId, requestedId);

    if (!inTenant) {
      // Fall back to the tenant's first property rather than silently serving
      // data from a property outside the active tenant.
      const tenantProperties = await db.getPropertiesByTenant(tenantId);
      propertyId = tenantProperties[0]?.id ?? requestedId;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    propertyId,
    tenantId,
    tenantRole,
    tenantStatus,
  };
}

/** Parse a numeric id from a request header value, or null if absent/invalid. */
function parseHeaderId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Module-level cache for the NO_AUTH admin user — avoids a DB round-trip
// on every single request when running as a Home Assistant addon.
let _noAuthUserCache: User | null = null;
// Companion cache for the NO_AUTH user's active tenant.
let _noAuthTenantCache: {
  tenantId: number;
  role: TenantRole;
  status: "active" | "suspended";
} | null = null;
// Cached resolution of whether the NO_AUTH auto-admin is active. Only the DB
// override can change it, and that path calls clearNoAuthUserCache(), so this
// avoids an app_settings read on every request in the common add-on case.
let _autoAdminActive: boolean | null = null;

/**
 * Whether this request should be served as the NO_AUTH auto-admin. Short-circuits
 * to false when the env flag is off; otherwise consults the (cached) runtime
 * override that lets an admin switch the install to real per-user login.
 */
async function autoAdminActive(): Promise<boolean> {
  if (!ENV.noAuth) return false;
  if (_autoAdminActive === null) {
    _autoAdminActive = !(await db.getLocalLoginEnabled());
  }
  return _autoAdminActive;
}

/**
 * Invalidate the cached NO_AUTH user so the next request re-reads it from the
 * DB. Must be called after mutating a cached field (e.g. the UI language via
 * profiles.setLanguage); otherwise the change wouldn't take effect until the
 * server process restarts.
 */
export function clearNoAuthUserCache(): void {
  _noAuthUserCache = null;
  _noAuthTenantCache = null;
  _autoAdminActive = null;
}
