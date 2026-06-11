/**
 * Notifications entry point — the channel registry and `notify()`, the single
 * function the rest of the server calls to deliver a notification across a
 * user's enabled channels (with idempotency + history via the delivery log).
 */

import { dispatchNotification } from "./dispatch";
import { resolveMessage } from "./i18n";
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
  ReminderMessage,
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
 * Deliver `message` to `userId` across their enabled, configured channels.
 * The message is resolved into the recipient's preferred language first, so the
 * delivered text (and the stored in-app copy) match the user's UI language.
 * Idempotent per (channel, dedupeKey); persists "sent"/"failed" to the log
 * ("skipped" is intentionally not persisted to avoid daily noise).
 */
export async function notify(
  userId: number,
  message: ReminderMessage,
  opts: { channels?: NotificationChannel[]; propertyId?: number } = {}
): Promise<ChannelResult[]> {
  const recipient = await getNotificationRecipient(userId);
  if (!recipient) return [];
  const enabledChannels = await getEnabledChannels(userId);
  const payload = resolveMessage(message, recipient.language);

  return dispatchNotification(recipient, payload, {
    channels: opts.channels ?? channels,
    enabledChannels,
    isAlreadySent: (channel, dedupeKey) =>
      isDeliverySent(userId, channel, dedupeKey),
    record: async result => {
      if (result.status === "skipped") return;
      await recordDelivery({
        userId,
        propertyId: opts.propertyId ?? null,
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
  const recipient = await getNotificationRecipient(userId);
  if (!recipient) return [];
  const payload = resolveMessage(
    {
      dedupeKey: `test:${channel}:${Date.now()}`,
      category: "system",
      titleKey: "test.title",
      bodyKey: "test.body",
      url: "/settings/notifications",
    },
    recipient.language
  );
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
