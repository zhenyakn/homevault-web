import { z } from "zod";
import { notifyOwner } from "./notification";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc";
import { ENV } from "./env";
import * as db from "../db";

// app_settings key under which the admin-configured Google Maps JS API key lives.
const GOOGLE_MAPS_KEY = "google.maps.apiKey";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  // Exposes server-side runtime flags to the frontend.
  // Used by the client to detect NO_AUTH mode (HA addon) at runtime,
  // since VITE_* build-time vars are always empty in the pre-built image.
  noAuth: publicProcedure.query(async () => ({
    // The *effective* auto-admin state: false once an admin has switched a
    // NO_AUTH install over to real per-user login, so the client renders the
    // login screen instead of waiting for the auto-admin session.
    noAuth: await db.isAutoAdminActive(),
  })),

  // Public bootstrap flags the signed-out client needs before there's a user:
  // the deployment mode (mirrored like NO_AUTH, since VITE_* vars are empty in
  // the pre-built image) and whether open self-registration is offered. Both
  // honour the admin-set app_settings override over the env default.
  config: publicProcedure.query(async () => ({
    noAuth: await db.isAutoAdminActive(),
    appMode: await db.getAppMode(),
    signupsEnabled: await db.getSignupsEnabled(),
  })),

  // The Google Maps JS API key the frontend should load with. It's a public,
  // referrer-restricted browser key, so it's safe to hand to any signed-in user
  // (the map embeds it in the page anyway). Returns null when none is set, in
  // which case the client falls back to its build-time key, if any.
  googleMapsKey: protectedProcedure.query(async () => {
    const apiKey = await db.getSetting(GOOGLE_MAPS_KEY);
    return { apiKey: apiKey || null };
  }),

  // Admin-only: store (or clear, when blank) the Google Maps API key.
  setGoogleMapsKey: adminProcedure
    .input(z.object({ apiKey: z.string().max(200) }))
    .mutation(async ({ input }) => {
      const key = input.apiKey.trim();
      if (key) await db.setSetting(GOOGLE_MAPS_KEY, key);
      else await db.deleteSetting(GOOGLE_MAPS_KEY);
      return { success: true } as const;
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
