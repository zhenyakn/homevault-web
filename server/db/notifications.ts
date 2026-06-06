import { and, desc, eq, isNull, gt } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import {
  users,
  notificationPrefs,
  notificationLog,
  webPushSubscriptions,
  botLinkCodes,
  type InsertNotificationLogRow,
} from "../../drizzle/schema";
import { getDb } from "./client";
import {
  CHANNEL_KEYS,
  type ChannelKey,
  type Recipient,
} from "../notifications/types";

/** Channels on by default when the user has no explicit preference row. */
export const DEFAULT_ENABLED_CHANNELS: ReadonlySet<ChannelKey> =
  new Set<ChannelKey>(["inapp", "push", "email"]);

// ── Recipient + channel preferences ───────────────────────────────────────────

export async function getNotificationRecipient(
  userId: number
): Promise<Recipient | undefined> {
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      telegramChatId: users.telegramChatId,
      whatsappPhone: users.whatsappPhone,
      language: users.language,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0];
}

export async function getPrefs(
  userId: number
): Promise<Record<ChannelKey, boolean>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId));
  const byChannel = new Map(
    rows.map(r => [r.channel as ChannelKey, r.enabled])
  );
  const out = {} as Record<ChannelKey, boolean>;
  for (const ch of CHANNEL_KEYS) {
    out[ch] = byChannel.has(ch)
      ? Boolean(byChannel.get(ch))
      : DEFAULT_ENABLED_CHANNELS.has(ch);
  }
  return out;
}

export async function getEnabledChannels(
  userId: number
): Promise<Set<ChannelKey>> {
  const prefs = await getPrefs(userId);
  return new Set(CHANNEL_KEYS.filter(ch => prefs[ch]));
}

export async function setPref(
  userId: number,
  channel: ChannelKey,
  enabled: boolean
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: notificationPrefs.id })
    .from(notificationPrefs)
    .where(
      and(
        eq(notificationPrefs.userId, userId),
        eq(notificationPrefs.channel, channel)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(notificationPrefs)
      .set({ enabled })
      .where(eq(notificationPrefs.id, existing[0].id));
  } else {
    await db.insert(notificationPrefs).values({ userId, channel, enabled });
  }
}

export async function setDestinations(
  userId: number,
  dest: { email?: string | null; whatsappPhone?: string | null }
): Promise<void> {
  const db = await getDb();
  const set: Record<string, unknown> = {};
  if (dest.email !== undefined) set.email = dest.email || null;
  if (dest.whatsappPhone !== undefined)
    set.whatsappPhone = dest.whatsappPhone || null;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

// ── Delivery log (idempotency + history + in-app feed) ─────────────────────────

export async function isDeliverySent(
  userId: number,
  channel: ChannelKey,
  dedupeKey: string
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.channel, channel),
        eq(notificationLog.dedupeKey, dedupeKey),
        eq(notificationLog.status, "sent")
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function recordDelivery(
  row: InsertNotificationLogRow
): Promise<void> {
  const db = await getDb();
  await db.insert(notificationLog).values(row);
}

export async function listInApp(
  userId: number,
  opts: { unreadOnly?: boolean; limit?: number } = {}
) {
  const db = await getDb();
  const conds = [
    eq(notificationLog.userId, userId),
    eq(notificationLog.channel, "inapp"),
    eq(notificationLog.status, "sent"),
  ];
  if (opts.unreadOnly) conds.push(isNull(notificationLog.readAt));
  return db
    .select()
    .from(notificationLog)
    .where(and(...conds))
    .orderBy(desc(notificationLog.createdAt))
    .limit(opts.limit ?? 50);
}

export async function markRead(id: number, userId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(notificationLog)
    .set({ readAt: new Date() })
    .where(and(eq(notificationLog.id, id), eq(notificationLog.userId, userId)));
}

export async function markAllRead(userId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(notificationLog)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.channel, "inapp"),
        isNull(notificationLog.readAt)
      )
    );
}

// ── Web Push subscriptions ────────────────────────────────────────────────────

export async function addWebPushSubscription(
  userId: number,
  sub: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const db = await getDb();
  await db
    .insert(webPushSubscriptions)
    .values({ userId, ...sub })
    .onDuplicateKeyUpdate({
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
}

export async function removeWebPushSubscription(
  endpoint: string
): Promise<void> {
  const db = await getDb();
  await db
    .delete(webPushSubscriptions)
    .where(eq(webPushSubscriptions.endpoint, endpoint));
}

export async function getWebPushSubscriptions(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(webPushSubscriptions)
    .where(eq(webPushSubscriptions.userId, userId));
}

// ── Telegram account linking ──────────────────────────────────────────────────

const linkCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export async function createTelegramLinkCode(userId: number): Promise<string> {
  const db = await getDb();
  const code = `HV-${linkCode().slice(0, 4)}-${linkCode().slice(0, 3)}`;
  await db.insert(botLinkCodes).values({
    userId,
    code,
    expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
  });
  return code;
}

/** Consume a link code, returning the userId if valid (unconsumed, unexpired). */
export async function consumeTelegramLinkCode(
  code: string
): Promise<number | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(botLinkCodes)
    .where(
      and(
        eq(botLinkCodes.code, code),
        isNull(botLinkCodes.consumedAt),
        gt(botLinkCodes.expiresAt, new Date())
      )
    )
    .limit(1);
  if (rows.length === 0) return undefined;
  await db
    .update(botLinkCodes)
    .set({ consumedAt: new Date() })
    .where(eq(botLinkCodes.id, rows[0].id));
  return rows[0].userId;
}

export async function setTelegramChatId(
  userId: number,
  chatId: string | null
): Promise<void> {
  const db = await getDb();
  await db
    .update(users)
    .set({ telegramChatId: chatId })
    .where(eq(users.id, userId));
}

export async function getUserByTelegramChatId(chatId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.telegramChatId, chatId))
    .limit(1);
  return rows[0];
}
