import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

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

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  const rawPropertyId = opts.req.headers["x-property-id"];
  const propertyId = rawPropertyId ? parseInt(rawPropertyId as string, 10) || 1 : 1;

  return {
    req: opts.req,
    res: opts.res,
    user,
    propertyId,
  };
}
