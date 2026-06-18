import webpush from "web-push";
import {
  getWebPushSubscriptions,
  removeWebPushSubscription,
} from "../../db/notifications";
import { getNotificationConfig, isSectionConfigured } from "../config";
import type { NotificationChannel } from "../types";

// Remember the VAPID details we last handed to web-push so a runtime change
// (admin pastes new keys / rotates them) is picked up instead of being pinned to
// whatever was set on first send.
let vapidKey = "";
function ensureVapid(): void {
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } =
    getNotificationConfig();
  if (!vapidPublicKey || !vapidPrivateKey) return;
  const key = `${vapidSubject}|${vapidPublicKey}|${vapidPrivateKey}`;
  if (key === vapidKey) return;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  vapidKey = key;
}

/**
 * Browser Web Push (VAPID). Sends to every subscription the user has, pruning
 * any that the push service reports as gone (404/410).
 */
export const webPushChannel: NotificationChannel = {
  key: "webpush",
  isConfigured: () => isSectionConfigured("webpush"),
  canDeliverTo: () => true, // subscription presence is checked in send()
  async send(recipient, payload) {
    ensureVapid();
    const subs = await getWebPushSubscriptions(recipient.id);
    if (subs.length === 0) throw new Error("No web-push subscriptions");

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
    });

    let delivered = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        delivered++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await removeWebPushSubscription(s.endpoint);
        }
      }
    }
    if (delivered === 0) throw new Error("All web-push deliveries failed");
  },
};
