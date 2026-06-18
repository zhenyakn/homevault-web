import { getNotificationConfig, isSectionConfigured } from "../config";
import { formatPlainText } from "../format";
import type { NotificationChannel } from "../types";

/**
 * WhatsApp outbound via the Meta WhatsApp Cloud API (Graph API). Configured when
 * a phone-number id + a permanent access token are set (env or admin UI).
 *
 * Sends a plain text message to the recipient's E.164 phone number. Note: Meta
 * only allows free-form text inside a 24h customer-service window; outside it a
 * pre-approved template is required. HomeVault reminders are transactional and
 * generally land inside that window, and the API surfaces a clear error
 * otherwise — which the dispatcher records as a `failed` delivery.
 */
export const whatsappChannel: NotificationChannel = {
  key: "whatsapp",
  isConfigured: () => isSectionConfigured("whatsapp"),
  canDeliverTo: r => Boolean(r.whatsappPhone),
  async send(recipient, payload) {
    const { whatsappPhoneNumberId, whatsappAccessToken, whatsappApiVersion } =
      getNotificationConfig();
    const to = (recipient.whatsappPhone ?? "").replace(/[^\d]/g, "");
    const res = await fetch(
      `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${whatsappAccessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: formatPlainText(payload) },
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
    }
  },
};
