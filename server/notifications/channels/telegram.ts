import { ENV } from "../../_core/env";
import { formatPlainText } from "../format";
import type { NotificationChannel } from "../types";

/** Telegram outbound via the Bot API sendMessage endpoint. */
export const telegramChannel: NotificationChannel = {
  key: "telegram",
  isConfigured: () => Boolean(ENV.telegramBotToken),
  canDeliverTo: r => Boolean(r.telegramChatId),
  async send(recipient, payload) {
    const res = await fetch(
      `https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient.telegramChatId,
          text: formatPlainText(payload),
        }),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed (${res.status}): ${detail}`);
    }
  },
};
