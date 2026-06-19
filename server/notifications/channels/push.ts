import { getForgeConfig } from "../../_core/integrationsConfig";
import { notifyOwner } from "../../_core/notification";
import type { NotificationChannel } from "../types";

/**
 * Push via the existing Forge "SendNotification" service (reuses notifyOwner).
 * Forge notifies the project owner, so there's no per-recipient destination.
 */
export const pushChannel: NotificationChannel = {
  key: "push",
  isConfigured: () => {
    const { apiUrl, apiKey } = getForgeConfig();
    return Boolean(apiUrl && apiKey);
  },
  canDeliverTo: () => true,
  async send(_recipient, payload) {
    const ok = await notifyOwner({
      title: payload.title,
      content: payload.body,
    });
    if (!ok) throw new Error("Forge push was not accepted");
  },
};
