import type { NotificationChannel } from "../types";

/**
 * WhatsApp placeholder. The Business API (templates, verification, a provider
 * like Twilio/Meta) is Phase 3; until credentials are wired, this channel is
 * never configured, so the dispatcher always skips it gracefully.
 */
export const whatsappChannel: NotificationChannel = {
  key: "whatsapp",
  isConfigured: () => false,
  canDeliverTo: r => Boolean(r.whatsappPhone),
  async send() {
    throw new Error("WhatsApp channel is not configured yet");
  },
};
