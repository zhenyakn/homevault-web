/**
 * mockNotifications — Phase 1 (UX/UI preview) data only.
 *
 * This module is the SINGLE source of fake data for the notifications + bot
 * preview experience. There is NO backend behind any of it yet: the UI reads
 * these arrays into local React state and mutates that state in memory.
 *
 * When the real backend lands (Phase 2), the components that consume this file
 * switch their data source to the `notification.*` tRPC procedures and this
 * module can be deleted. Keep everything self-contained here so that swap is a
 * one-import change.
 */

export type NotificationCategory =
  | "expense"
  | "loan"
  | "repair"
  | "warranty"
  | "calendar"
  | "system";

export type MockNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Minutes ago, used to derive a relative timestamp at render time. */
  minutesAgo: number;
  read: boolean;
  /** In-app route to open when the item is clicked. */
  url?: string;
};

export type ChannelKey =
  | "inapp"
  | "push"
  | "email"
  | "webpush"
  | "telegram"
  | "whatsapp";

export type MockChannel = {
  key: ChannelKey;
  enabled: boolean;
  /** Whether a destination/credential is set up (drives the status badge). */
  configured: boolean;
  /** Human-readable destination, where the channel has one. */
  destination?: string;
};

export type BotTurn = {
  from: "user" | "bot";
  text: string;
  /** Marks the turn that should render an inline Confirm / Cancel control. */
  confirm?: boolean;
};

/**
 * Seed feed for the header notification center. A realistic spread across
 * categories and read/unread so the badge count and styling are demoable.
 */
export const mockNotifications: MockNotification[] = [
  {
    id: "n1",
    category: "expense",
    title: "Property tax due in 3 days",
    body: "Annual municipal tax of ₪4,200 is due on the 9th.",
    minutesAgo: 25,
    read: false,
    url: "/expenses",
  },
  {
    id: "n2",
    category: "warranty",
    title: "Fridge warranty expires next week",
    body: "Samsung RF65 warranty ends Jun 14 — consider an extension.",
    minutesAgo: 180,
    read: false,
    url: "/inventory",
  },
  {
    id: "n3",
    category: "repair",
    title: "Roof leak repair is stale",
    body: "High-priority repair has had no update for 6 days.",
    minutesAgo: 60 * 22,
    read: false,
    url: "/repairs",
  },
  {
    id: "n4",
    category: "loan",
    title: "Mortgage payment coming up",
    body: "Next repayment of ₪6,150 is scheduled for Jun 10.",
    minutesAgo: 60 * 30,
    read: true,
    url: "/loans",
  },
  {
    id: "n5",
    category: "calendar",
    title: "Annual boiler inspection tomorrow",
    body: "Reminder: technician visit at 09:00.",
    minutesAgo: 60 * 48,
    read: true,
    url: "/calendar",
  },
];

/**
 * Default channel configuration shown in Settings → Notifications. `inapp` and
 * `push` are pre-enabled; the rest are off / unconfigured so both states show.
 */
export const mockChannels: MockChannel[] = [
  { key: "inapp", enabled: true, configured: true },
  { key: "push", enabled: true, configured: true },
  {
    key: "email",
    enabled: true,
    configured: true,
    destination: "konstantinovsky.evgeni@gmail.com",
  },
  { key: "webpush", enabled: false, configured: false },
  { key: "telegram", enabled: false, configured: false, destination: "" },
  { key: "whatsapp", enabled: false, configured: false, destination: "" },
];

/** Code the user would paste into the bot via `/link <code>`. */
export const mockTelegramLinkCode = "HV-7K2Q-9XZ";

/** The handle shown once a chat is "connected" in the preview. */
export const mockTelegramHandle = "@evgeni";

/**
 * Scripted two-way conversation for the bot preview. Illustrates a read
 * command, a dashboard query, and a write (`/addexpense`) that asks for
 * confirmation before committing.
 */
export const mockBotTranscript: BotTurn[] = [
  { from: "user", text: "/overdue" },
  {
    from: "bot",
    text: "You have 2 items needing attention:\n• Property tax — ₪4,200 (due in 3 days)\n• Roof leak repair — stale 6 days",
  },
  { from: "user", text: "/dashboard" },
  {
    from: "bot",
    text: "🏠 My Home\nSpent this month: ₪3,180\nOpen repairs: 2\nNext loan payment: ₪6,150 on Jun 10",
  },
  { from: "user", text: "/addexpense 100 Water" },
  {
    from: "bot",
    text: "Add expense “Water” for ₪100 under Utilities?",
    confirm: true,
  },
  { from: "bot", text: "✅ Added “Water” (₪100). Logged for My Home." },
];

/** Canned replies the preview cycles through for free-text input. */
export const mockBotReplies: string[] = [
  "Got it — I’ll note that down.",
  "Here’s what I found in your HomeVault.",
  "Done. Anything else?",
];
