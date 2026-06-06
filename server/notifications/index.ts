/**
 * Notifications entry point — the channel registry and `notify()`, the single
 * function the rest of the server calls to deliver a notification across a
 * user's enabled channels (with idempotency + history via the delivery log).
 */

import { dispatchNotification } from "./dispatch";
import { inAppChannel } from "./channels/inapp";
import { pushChannel } from "./channels/push";
import { emailChannel } from "./channels/email";
import { webPushChannel } from "./channels/webpush";
import { telegramChannel } from "./channels/telegram";
import { whatsappChannel } from "./channels/whatsapp";
import {
  getEnabledChannels,
  getNotificationRecipient,
  isDeliverySent,
  recordDelivery,
} from "../db/notifications";
import type {
  ChannelKey,
  ChannelResult,
  NotificationChannel,
  NotificationPayload,
} from "./types";

/** All registered channel adapters, in fan-out order. */
export const channels: NotificationChannel[] = [
  inAppChannel,
  pushChannel,
  emailChannel,
  webPushChannel,
  telegramChannel,
  whatsappChannel,
];

/**
 * Deliver `payload` to `userId` across their enabled, configured channels.
 * Idempotent per (channel, dedupeKey); persists "sent"/"failed" to the log
 * ("skipped" is intentionally not persisted to avoid daily noise).
 */
export async function notify(
  userId: number,
  payload: NotificationPayload,
  opts: { channels?: NotificationChannel[] } = {}
): Promise<ChannelResult[]> {
  const recipient = await getNotificationRecipient(userId);
  if (!recipient) return [];
  const enabledChannels = await getEnabledChannels(userId);

  return dispatchNotification(recipient, payload, {
    channels: opts.channels ?? channels,
    enabledChannels,
    isAlreadySent: (channel, dedupeKey) =>
      isDeliverySent(userId, channel, dedupeKey),
    record: async result => {
      if (result.status === "skipped") return;
      await recordDelivery({
        userId,
        channel: result.channel,
        category: payload.category,
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
        dedupeKey: payload.dedupeKey,
        status: result.status,
        reason: result.reason ?? null,
      });
    },
  });
}

/** Send a single test notification to one channel (ignores enabled prefs). */
export async function notifyTest(
  userId: number,
  channel: ChannelKey
): Promise<ChannelResult[]> {
  const payload: NotificationPayload = {
    dedupeKey: `test:${channel}:${Date.now()}`,
    category: "system",
    title: "HomeVault test notification",
    body: "This is a test notification. If you can read it, the channel works.",
    url: "/settings/notifications",
  };
  const recipient = await getNotificationRecipient(userId);
  if (!recipient) return [];
  return dispatchNotification(recipient, payload, {
    channels,
    enabledChannels: new Set([channel]),
    record: async result => {
      if (result.status === "skipped") return;
      await recordDelivery({
        userId,
        channel: result.channel,
        category: payload.category,
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
        dedupeKey: payload.dedupeKey,
        status: result.status,
        reason: result.reason ?? null,
      });
    },
  });
}
