/**
 * tRPC router for the notification system: channel preferences, destinations,
 * the Telegram link-code flow, web-push subscriptions, the in-app feed, test
 * sends, and an admin-only manual sweep trigger.
 */

import webpush from "web-push";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { CHANNEL_KEYS, type ChannelKey } from "./notifications/types";
import { notifyTest } from "./notifications";
import { runReminderSweep } from "./notifications/scheduler";
import {
  getNotificationConfig,
  getNotificationConfigStatus,
  saveNotificationConfig,
} from "./notifications/config";
import {
  getIntegrationsConfigStatus,
  saveIntegrationsConfig,
} from "./_core/integrationsConfig";
import {
  TESTABLE_SECTIONS,
  getIntegrationTestResults,
  runIntegrationTest,
  type TestableSection,
} from "./notifications/verify";
import { hasCapability } from "./db/entitlements";
import type { CapabilityKey } from "./billing/capabilities";
import * as notif from "./db/notifications";
import { logAudit } from "./db/audit";
import {
  getBotUsername,
  resetBot,
  syncTelegramDelivery,
  getTelegramDeliveryStatus,
} from "./bot/telegram";

const integrationSectionEnum = z.enum(
  TESTABLE_SECTIONS as unknown as [TestableSection, ...TestableSection[]]
);

const channelEnum = z.enum(
  CHANNEL_KEYS as unknown as [ChannelKey, ...ChannelKey[]]
);

/** Channels that are a paid capability (SAAS-gated). Others are always on. */
const CHANNEL_CAPABILITY: Partial<Record<ChannelKey, CapabilityKey>> = {
  telegram: "notifications.telegram",
  whatsapp: "notifications.whatsapp",
};

/** Throw if the tenant's plan doesn't include the channel (SAAS only). */
async function assertChannelAllowed(
  tenantId: number | null,
  channel: ChannelKey
): Promise<void> {
  const cap = CHANNEL_CAPABILITY[channel];
  if (!cap || tenantId == null) return;
  if (!(await hasCapability(tenantId, cap))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your plan does not include ${channel} notifications.`,
    });
  }
}

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
      // The real bot username (from the configured token), so the UI tells users
      // which bot to open instead of a hardcoded guess. Null when no token / unreachable.
      telegramBotUsername: await getBotUsername(),
      webPushAvailable: Boolean(getNotificationConfig().vapidPublicKey),
    };
  }),

  setPref: protectedProcedure
    .input(z.object({ channel: channelEnum, enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Only block enabling a gated channel; disabling is always permitted.
      if (input.enabled) {
        await assertChannelAllowed(ctx.tenantId, input.channel);
      }
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
    await assertChannelAllowed(ctx.tenantId, "telegram");
    const code = await notif.createTelegramLinkCode(ctx.user.id);
    return { code };
  }),

  unlinkTelegram: protectedProcedure.mutation(async ({ ctx }) => {
    await notif.setTelegramChatId(ctx.user.id, null);
    return { ok: true } as const;
  }),

  // ── Web push ───────────────────────────────────────────────────────────────
  getVapidPublicKey: protectedProcedure.query(() => ({
    key: getNotificationConfig().vapidPublicKey || null,
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

  deleteInApp: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await notif.deleteInApp(input.id, ctx.user.id);
      return { ok: true } as const;
    }),

  // ── Test send ──────────────────────────────────────────────────────────────
  sendTest: protectedProcedure
    .input(z.object({ channel: channelEnum }))
    .mutation(async ({ ctx, input }) => {
      await assertChannelAllowed(ctx.tenantId, input.channel);
      const results = await notifyTest(ctx.user.id, input.channel);
      const result = results[0];
      return {
        status: result?.status ?? "skipped",
        reason: result?.reason ?? null,
      };
    }),

  // ── Admin: server-side channel credentials (env-first, app_settings-backed) ─
  /** Masked status of every channel's server config for the admin Settings UI. */
  getChannelConfig: adminProcedure.query(async () => ({
    ...getNotificationConfigStatus(),
    ...getIntegrationsConfigStatus(),
    // Last "Test connection" outcome per section, so the UI shows a durable
    // success/failure indicator (not just "credentials present").
    lastTests: await getIntegrationTestResults(),
  })),

  /**
   * Persist channel credentials for one section. Secrets left blank are kept;
   * non-secret fields left blank are cleared (fall back to env / default).
   */
  saveChannelConfig: adminProcedure
    .input(
      z.object({
        email: z
          .object({
            smtpHost: z.string().max(255).optional(),
            smtpPort: z.string().max(10).optional(),
            smtpUser: z.string().max(255).optional(),
            smtpPass: z.string().max(255).optional(),
            smtpFrom: z.string().max(255).optional(),
          })
          .optional(),
        telegram: z
          .object({ telegramBotToken: z.string().max(255).optional() })
          .optional(),
        webpush: z
          .object({
            vapidPublicKey: z.string().max(255).optional(),
            vapidPrivateKey: z.string().max(255).optional(),
            vapidSubject: z.string().max(255).optional(),
          })
          .optional(),
        whatsapp: z
          .object({
            whatsappPhoneNumberId: z.string().max(64).optional(),
            whatsappAccessToken: z.string().max(512).optional(),
            whatsappApiVersion: z.string().max(16).optional(),
          })
          .optional(),
        push: z
          .object({
            forgeApiUrl: z.string().max(512).optional(),
            forgeApiKey: z.string().max(512).optional(),
          })
          .optional(),
        general: z
          .object({
            publicBaseUrl: z.string().max(512).optional(),
            telegramWebhookSecret: z.string().max(255).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await saveNotificationConfig({
        ...input.email,
        ...input.telegram,
        ...input.webpush,
        ...input.whatsapp,
      });
      await saveIntegrationsConfig({
        ...input.push,
        ...input.general,
      });
      // Audit which integration sections were edited (never the values/secrets),
      // so config changes are traceable in the admin audit log.
      const sections = Object.keys(input).filter(
        k => input[k as keyof typeof input]
      );
      await logAudit({
        actorUserId: ctx.user.id,
        action: "admin.integration.config_changed",
        targetType: "integration",
        targetId: sections.join(",") || null,
        metadata: { sections },
      });
      // When the Telegram token or webhook settings change, reconnect the bot
      // live (webhook or polling) so it works without a restart. Reset the
      // cached bot first so a new token takes effect. Best-effort — never fails
      // the save.
      let telegram: Awaited<ReturnType<typeof syncTelegramDelivery>> | undefined;
      if (input.telegram || input.general) {
        resetBot();
        telegram = await syncTelegramDelivery();
      }
      return { ok: true, telegram } as const;
    }),

  /** Live Telegram delivery state (webhook / polling / none) for the Settings UI. */
  getTelegramDeliveryStatus: adminProcedure.query(() =>
    getTelegramDeliveryStatus()
  ),

  /**
   * Manually reconnect the bot — for when a token came from env or the public
   * URL changed after boot. Resets the cached bot so the current token is used,
   * then connects via webhook or polling depending on whether a public HTTPS URL
   * is configured.
   */
  reconnectTelegram: adminProcedure.mutation(async ({ ctx }) => {
    resetBot();
    const result = await syncTelegramDelivery();
    await logAudit({
      actorUserId: ctx.user.id,
      action: "admin.integration.config_changed",
      targetType: "integration",
      targetId: "telegram.delivery",
      metadata: {
        result: result.ok ? result.mode : result.reason,
      },
    });
    return result;
  }),

  /**
   * Actively test one integration's connection (real handshake / API call), then
   * persist the outcome and write an audit entry recording who tested what, when,
   * and the result. Returns the outcome for immediate display.
   */
  testIntegration: adminProcedure
    .input(
      z.object({
        section: integrationSectionEnum,
        // Email only: when present, send a real test message to this address as
        // part of the SMTP validation (not just the handshake).
        testEmailTo: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await runIntegrationTest(input.section, ctx.user.id, {
        testEmailTo: input.testEmailTo,
      });
      await logAudit({
        actorUserId: ctx.user.id,
        action: "admin.integration.tested",
        targetType: "integration",
        targetId: input.section,
        metadata: {
          status: record.ok ? "ok" : "failed",
          detail: record.detail || null,
          // Record that a real message was sent (never the address itself).
          sentTestEmail:
            input.section === "email" && Boolean(input.testEmailTo),
        },
      });
      return record;
    }),

  /**
   * Generate a fresh VAPID keypair and persist it as the Web Push config, so an
   * admin can enable browser push from the UI without running the CLI. Returns
   * the public key for immediate display.
   */
  generateVapidKeys: adminProcedure.mutation(async () => {
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    await saveNotificationConfig({
      vapidPublicKey: publicKey,
      vapidPrivateKey: privateKey,
    });
    return { publicKey } as const;
  }),

  // ── Admin: run the sweep now (for testing/manual trigger) ──────────────────
  runSweepNow: adminProcedure.mutation(() => runReminderSweep()),
});
