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
 * A language-independent description of a notification. The sweep and test
 * sender produce these (i18n key + interpolation params); they're resolved into
 * a `NotificationPayload` per recipient via the recipient's language. Keeping
 * the keys here (not literal text) is what lets one event be delivered in each
 * recipient's chosen language.
 */
export type ReminderMessage = {
  dedupeKey: string;
  category: NotificationCategory;
  /** i18n key for the title (see server/notifications/locales). */
  titleKey: string;
  /** i18n key for the body. */
  bodyKey: string;
  /** Interpolation values for the title/body templates. */
  params?: Record<string, string | number>;
  /** Optional in-app route the notification links to. */
  url?: string;
};

/**
 * A single notification ready to deliver — the resolved (translated) form a
 * channel sends and the delivery log stores. `dedupeKey` is stable for a given
 * logical event (e.g. "expense-due:<id>:<date>") so the same reminder is never
 * sent twice, even if the sweep runs repeatedly.
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
  /** Preferred language; selects the language of the delivered text. */
  language?: string | null;
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
