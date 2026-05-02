import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  propertyId: number;
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
        role: "admin",
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

  // Resolve propertyId from the request header, then validate ownership.
  // This prevents a logged-in user from spoofing another user's propertyId.
  const rawPropertyId = opts.req.headers["x-property-id"];
  const requestedId = rawPropertyId
    ? parseInt(rawPropertyId as string, 10) || 1
    : 1;

  let propertyId = requestedId;

  if (user) {
    const ownedProperties = await db.getPropertiesByUser(user.id);
    const isOwned = ownedProperties.some((p) => p.id === requestedId);

    if (!isOwned) {
      // Fall back to the first owned property rather than silently
      // serving data from an unrelated property.
      propertyId = ownedProperties[0]?.id ?? requestedId;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    propertyId,
  };
}

// Module-level cache for the NO_AUTH admin user — avoids a DB round-trip
// on every single request when running as a Home Assistant addon.
let _noAuthUserCache: User | null = null;
