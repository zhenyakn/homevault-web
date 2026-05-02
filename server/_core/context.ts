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

    // Ensure the owner user exists in the DB
    await db.upsertUser({
      openId,
      name: "HomeVault Admin",
      email: "admin@local",
      role: "admin",
      lastSignedIn: new Date(),
    });

    const existing = await db.getUserByOpenId(openId);
    user = existing ?? null;
  } else {
    // Normal behavior: authenticate via session cookie / OAuth
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }

  const rawPropertyId = opts.req.headers["x-property-id"];
  const propertyId = rawPropertyId
    ? parseInt(rawPropertyId as string, 10) || 1
    : 1;

  return {
    req: opts.req,
    res: opts.res,
    user,
    propertyId,
  };
}
