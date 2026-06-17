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
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // NO_AUTH mode: always treat the owner as logged-in
  if (ENV.noAuth) {
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

  if (user) {
    if (ENV.noAuth && _noAuthTenantCache) {
      ({ tenantId, tenantRole } = {
        tenantId: _noAuthTenantCache.tenantId,
        tenantRole: _noAuthTenantCache.role,
      });
    } else {
      const requestedTenantId = parseHeaderId(opts.req.headers["x-tenant-id"]);
      const active = await db.resolveActiveTenant(user.id, {
        requestedTenantId,
        defaultTenantId: user.defaultTenantId,
        displayName: user.name,
      });
      tenantId = active.tenantId;
      tenantRole = active.role;
      // NO_AUTH is single-user/single-tenant; cache to avoid per-request work.
      if (ENV.noAuth) _noAuthTenantCache = active;
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
let _noAuthTenantCache: { tenantId: number; role: TenantRole } | null = null;

/**
 * Invalidate the cached NO_AUTH user so the next request re-reads it from the
 * DB. Must be called after mutating a cached field (e.g. the UI language via
 * profiles.setLanguage); otherwise the change wouldn't take effect until the
 * server process restarts.
 */
export function clearNoAuthUserCache(): void {
  _noAuthUserCache = null;
  _noAuthTenantCache = null;
}
