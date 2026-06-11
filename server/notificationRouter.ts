/**
 * tRPC router for the notification system: channel preferences, destinations,
 * the Telegram link-code flow, web-push subscriptions, the in-app feed, test
 * sends, and an admin-only manual sweep trigger.
 */

import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { CHANNEL_KEYS, type ChannelKey } from "./notifications/types";
import { notifyTest } from "./notifications";
import { runReminderSweep } from "./notifications/scheduler";
import * as notif from "./db/notifications";

const channelEnum = z.enum(
  CHANNEL_KEYS as unknown as [ChannelKey, ...ChannelKey[]]
);

export const notificationRouter = router({
  // ── Preferences & destinations ─────────────────────────────────────────────
  getPrefs: protectedProcedure.query(({ ctx }) => notif.getPrefs(ctx.user.id)),

  /** Channel destinations + connection state for the Settings UI. */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const recipient = await notif.getNotificationRecipient(ctx.user.id);
    return {
      email: recipient?.email ?? null,
      whatsappPhone: recipient?.whatsappPhone ?? null,
      telegramLinked: Boolean(recipient?.telegramChatId),
      webPushAvailable: Boolean(ENV.vapidPublicKey),
    };
  }),

  setPref: protectedProcedure
    .input(z.object({ channel: channelEnum, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await notif.setPref(ctx.user.id, input.channel, input.enabled);
      return { ok: true } as const;
    }),

  setDestinations: protectedProcedure
    .input(
      z.object({
        email: z.string().email().or(z.literal("")).optional(),
        whatsappPhone: z.string().max(32).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await notif.setDestinations(ctx.user.id, input);
      return { ok: true } as const;
    }),

  // ── Telegram linking ───────────────────────────────────────────────────────
  createTelegramLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
    const code = await notif.createTelegramLinkCode(ctx.user.id);
    return { code };
  }),

  unlinkTelegram: protectedProcedure.mutation(async ({ ctx }) => {
    await notif.setTelegramChatId(ctx.user.id, null);
    return { ok: true } as const;
  }),

  // ── Web push ───────────────────────────────────────────────────────────────
  getVapidPublicKey: protectedProcedure.query(() => ({
    key: ENV.vapidPublicKey || null,
  })),

  subscribeWebPush: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await notif.addWebPushSubscription(ctx.user.id, input);
      return { ok: true } as const;
    }),

  unsubscribeWebPush: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ input }) => {
      await notif.removeWebPushSubscription(input.endpoint);
      return { ok: true } as const;
    }),

  // ── In-app notification center ─────────────────────────────────────────────
  listInApp: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      notif.listInApp(ctx.user.id, {
        unreadOnly: input?.unreadOnly,
        propertyId: ctx.propertyId,
      })
    ),

  markRead: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await notif.markRead(input.id, ctx.user.id);
      return { ok: true } as const;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await notif.markAllRead(ctx.user.id, { propertyId: ctx.propertyId });
    return { ok: true } as const;
  }),

  // ── Test send ──────────────────────────────────────────────────────────────
  sendTest: protectedProcedure
    .input(z.object({ channel: channelEnum }))
    .mutation(async ({ ctx, input }) => {
      const results = await notifyTest(ctx.user.id, input.channel);
      const result = results[0];
      return {
        status: result?.status ?? "skipped",
        reason: result?.reason ?? null,
      };
    }),

  // ── Admin: run the sweep now (for testing/manual trigger) ──────────────────
  runSweepNow: adminProcedure.mutation(() => runReminderSweep()),
});
