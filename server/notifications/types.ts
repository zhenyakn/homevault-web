/**
 * Notification domain types — shared by the channel adapters, the dispatcher,
 * the reminder sweep, and the tRPC router. Kept dependency-free so the core
 * logic can be unit-tested without a DB or any external service.
 */

/** What a notification is about. Mirrors the client-side mock categories. */
export type NotificationCategory =
  | "expense"
  | "loan"
  | "repair"
  | "warranty"
  | "calendar"
  | "system";

/** Delivery channels. `inapp` is always available; the rest need config. */
export type ChannelKey =
  | "inapp"
  | "push"
  | "email"
  | "webpush"
  | "telegram"
  | "whatsapp";

export const CHANNEL_KEYS: readonly ChannelKey[] = [
  "inapp",
  "push",
  "email",
  "webpush",
  "telegram",
  "whatsapp",
] as const;

/**
 * A single notification to deliver. `dedupeKey` is stable for a given logical
 * event (e.g. "expense-due:<id>:<date>") so the same reminder is never sent
 * twice, even if the sweep runs repeatedly.
 */
export type NotificationPayload = {
  dedupeKey: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Optional in-app route the notification links to. */
  url?: string;
};

/** Minimal recipient shape a channel needs to deliver. */
export type Recipient = {
  id: number;
  name?: string | null;
  email?: string | null;
  telegramChatId?: string | null;
  whatsappPhone?: string | null;
};

/**
 * A delivery channel. Adapters implement this. `isConfigured` lets the
 * dispatcher skip channels whose credentials/destination are missing instead
 * of failing — so a minimal self-hosted setup degrades gracefully.
 */
export interface NotificationChannel {
  readonly key: ChannelKey;
  /** Server-side config present (e.g. SMTP creds, bot token). */
  isConfigured(): boolean;
  /** Recipient has a destination for this channel (e.g. an email address). */
  canDeliverTo(recipient: Recipient): boolean;
  /** Deliver. Throw on failure — the dispatcher isolates per-channel errors. */
  send(recipient: Recipient, payload: NotificationPayload): Promise<void>;
}

/** Outcome of attempting one channel for one notification. */
export type DeliveryStatus = "sent" | "failed" | "skipped";

export type ChannelResult = {
  channel: ChannelKey;
  status: DeliveryStatus;
  /** Present when status is "failed" or "skipped". */
  reason?: string;
};
