import type { NotificationChannel } from "../types";

/**
 * In-app channel. Delivery IS the `notification_log` row the dispatcher writes
 * via its `record` callback (the notification center reads channel='inapp'
 * rows), so `send` is a no-op that simply reports success.
 */
export const inAppChannel: NotificationChannel = {
  key: "inapp",
  isConfigured: () => true,
  canDeliverTo: () => true,
  async send() {
    /* no-op: the recorded log row is the delivery */
  },
};
