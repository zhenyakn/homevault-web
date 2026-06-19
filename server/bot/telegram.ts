/**
 * Telegram bot (grammY) — the two-way interface: consume + update HomeVault data
 * from chat. Account linking uses the link-code flow; read commands query the
 * DB; write commands (/addexpense, /paid) confirm before committing. Pure
 * command parsing lives in commands.ts (unit-tested); this module is the I/O.
 */

import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { RequestHandler } from "express";
import { nanoid } from "nanoid";
import { logger } from "../_core/logger";
import { getNotificationConfig } from "../notifications/config";
import {
  getPublicBaseUrl,
  getTelegramWebhookSecret,
} from "../_core/integrationsConfig";
import { parseCommand } from "./commands";
import { t, normalizeLanguage } from "./i18n";
import { todayInTz } from "../notifications/time";
import {
  consumeTelegramLinkCode,
  setTelegramChatId,
  getUserByTelegramChatId,
} from "../db/notifications";
import { getPropertiesByUser } from "../db/properties";
import {
  getExpenses,
  createExpense,
  updateExpense,
  getExpenseById,
} from "../db/expenses";
import { getDashboardStats, getOverdueExpenses } from "../db/dashboard";
import { getCalendarEvents } from "../db/calendar";

async function resolveContext(chatId: string) {
  const user = await getUserByTelegramChatId(chatId);
  if (!user) return null;
  const props = await getPropertiesByUser(user.id);
  const property = props[0];
  if (!property) return null;
  return { user, property };
}

/** The linked user's preferred language for this chat (defaults to en). */
async function resolveLang(chatId: string): Promise<string> {
  const user = await getUserByTelegramChatId(chatId);
  return normalizeLanguage(user?.language);
}

let bot: Bot | null = null;

/**
 * Lazily construct the bot. Returns null when no token is configured. The token
 * is resolved from the runtime notification config (env-first, then the
 * admin-set override loaded at boot), so a token pasted into Settings is honoured
 * after the next restart — the same lifecycle as the webhook registration.
 */
export function getBot(): Bot | null {
  if (bot) return bot;
  const { telegramBotToken } = getNotificationConfig();
  if (!telegramBotToken) return null;
  bot = new Bot(telegramBotToken);
  registerHandlers(bot);
  return bot;
}

/**
 * Drop the cached bot, username, and webhook handler so the next getBot() picks
 * up a freshly-configured token. Called after an admin saves the token in
 * Settings, letting a new bot take effect without a server restart.
 */
export function resetBot(): void {
  bot = null;
  cachedUsername = null;
  webhookHandler = null;
  webhookHandlerKey = null;
}

/** Cached `@username` of the configured bot, resolved once via getMe. */
let cachedUsername: string | null = null;

/**
 * Resolve the configured bot's Telegram username (without the leading "@").
 *
 * The Settings UI needs the *actual* bot the admin's token points to so it can
 * tell users which bot to open — hardcoding a name would send them to the wrong
 * bot and silently break linking. Result is cached for the process lifetime;
 * the token only changes on restart (same lifecycle as the webhook), which
 * resets this module's state. Returns null when no token is set or getMe fails.
 */
export async function getBotUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const b = getBot();
  if (!b) return null;
  try {
    const me = await b.api.getMe();
    cachedUsername = me.username ?? null;
    return cachedUsername;
  } catch (err) {
    logger.warn({ err }, "[telegram] failed to resolve bot username");
    return null;
  }
}

// The grammy→express middleware is bound to a specific bot instance + secret, so
// we cache it and rebuild only when either changes (new token / new secret).
let webhookHandler: RequestHandler | null = null;
let webhookHandlerKey: string | null = null;

/**
 * Express handler for inbound Telegram updates, resolved against the *current*
 * bot. Returns null when no bot is configured. Mounted once at boot; resolving
 * per-request means a token added later via Settings starts working without a
 * restart.
 */
export function getTelegramWebhookHandler(): RequestHandler | null {
  const b = getBot();
  if (!b) {
    webhookHandler = null;
    webhookHandlerKey = null;
    return null;
  }
  const secret = getTelegramWebhookSecret();
  // grammy ties the bot instance into the closure; the secret is captured at
  // creation, so the key must reflect both to know when to rebuild.
  const key = `${secret}`;
  if (!webhookHandler || webhookHandlerKey !== key) {
    webhookHandler = webhookCallback(b, "express", {
      secretToken: secret || undefined,
    }) as unknown as RequestHandler;
    webhookHandlerKey = key;
  }
  return webhookHandler;
}

export type WebhookSyncResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: "no-token" | "no-url" | "not-https" | "error";
      detail?: string;
    };

/**
 * Point Telegram at our webhook so it starts delivering updates. Resolves the
 * base URL from the argument, else the configured public base URL. Best-effort:
 * returns a typed reason instead of throwing so callers (boot, the Settings
 * mutation) can log or surface it without failing the surrounding operation.
 */
export async function syncTelegramWebhook(
  baseUrl?: string
): Promise<WebhookSyncResult> {
  const b = getBot();
  if (!b) return { ok: false, reason: "no-token" };
  const base = (baseUrl || getPublicBaseUrl()).replace(/\/+$/, "");
  if (!base) return { ok: false, reason: "no-url" };
  // Telegram only delivers to a public HTTPS endpoint — reject http/localhost
  // up front with a clear reason instead of surfacing a cryptic API error.
  if (!/^https:\/\//i.test(base)) return { ok: false, reason: "not-https" };
  const url = `${base}/api/bot/telegram`;
  try {
    await b.api.setWebhook(url, {
      secret_token: getTelegramWebhookSecret() || undefined,
    });
    return { ok: true, url };
  } catch (err) {
    logger.warn({ err, url }, "[telegram] failed to set webhook");
    return { ok: false, reason: "error", detail: errText(err) };
  }
}

export type WebhookInfo = {
  /** The URL Telegram is currently delivering to, or null when unset. */
  url: string | null;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
};

/** Live webhook registration state from Telegram (null when no bot / on error). */
export async function getTelegramWebhookInfo(): Promise<WebhookInfo | null> {
  const b = getBot();
  if (!b) return null;
  try {
    const info = await b.api.getWebhookInfo();
    return {
      url: info.url || null,
      pendingUpdateCount: info.pending_update_count ?? 0,
      lastErrorMessage: info.last_error_message || null,
    };
  } catch (err) {
    logger.warn({ err }, "[telegram] failed to read webhook info");
    return null;
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function registerHandlers(b: Bot) {
  // Confirm callback for /addexpense → "ax|<amount>|<name>"
  b.on("callback_query:data", async ctx => {
    const data = ctx.callbackQuery.data;
    const chatId = String(ctx.chat?.id ?? "");
    if (data === "cancel") {
      const lang = await resolveLang(chatId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(t(lang, "cancelled"));
      return;
    }
    if (data.startsWith("ax|")) {
      const [, amountStr, ...nameParts] = data.split("|");
      const amount = Number(amountStr);
      const name = nameParts.join("|");
      const context = await resolveContext(chatId);
      await ctx.answerCallbackQuery();
      if (!context) {
        await ctx.editMessageText(
          t(await resolveLang(chatId), "accountUnlinked")
        );
        return;
      }
      await createExpense({
        id: nanoid(),
        propertyId: context.property.id,
        ownerId: context.user.id,
        tenantId: context.property.tenantId,
        name,
        amount: Math.round(amount),
        category: "Other",
        date: todayInTz(context.property.timezone),
      } as any);
      await ctx.editMessageText(
        t(normalizeLanguage(context.user.language), "expenseAdded", {
          name,
          amount: Math.round(amount),
        })
      );
    }
  });

  b.on("message:text", async ctx => {
    const chatId = String(ctx.chat.id);
    const parsed = parseCommand(ctx.message.text);
    // Resolve the chat's user once so every reply can be localized.
    const linkedUser = await getUserByTelegramChatId(chatId);
    const lang = normalizeLanguage(linkedUser?.language);

    // Consume a link code and bind this chat to its user. The linking user may
    // differ from the previously-unlinked chat, so the success reply re-resolves
    // the language from the now-linked account.
    const tryLink = async (code: string): Promise<boolean> => {
      const userId = await consumeTelegramLinkCode(code);
      if (!userId) return false;
      await setTelegramChatId(userId, chatId);
      await ctx.reply(t(await resolveLang(chatId), "linkSuccess"));
      return true;
    };

    switch (parsed.type) {
      case "start":
        // Deep link (t.me/<bot>?start=<code>) → link in one tap; bare /start is
        // just a greeting. An invalid/expired code falls through to help.
        if (parsed.code && (await tryLink(parsed.code))) return;
        await ctx.reply(t(lang, "help"));
        return;

      case "help":
        await ctx.reply(t(lang, "help"));
        return;

      case "link": {
        if (!(await tryLink(parsed.code))) {
          await ctx.reply(t(lang, "linkInvalid"));
        }
        return;
      }

      case "invalid":
        await ctx.reply(t(lang, parsed.reasonKey));
        return;
    }

    // Everything below requires a linked account with a property.
    if (!linkedUser) {
      await ctx.reply(t(lang, "notLinked"));
      return;
    }
    const props = await getPropertiesByUser(linkedUser.id);
    const property = props[0];
    if (!property || property.tenantId == null) {
      await ctx.reply(t(lang, "notLinked"));
      return;
    }
    const user = linkedUser;
    const tenantId = property.tenantId;

    switch (parsed.type) {
      case "overdue": {
        const today = todayInTz(property.timezone);
        const [expenses, stats] = await Promise.all([
          getExpenses(tenantId, property.id),
          getDashboardStats(tenantId, property.id),
        ]);
        const overdue = getOverdueExpenses(expenses, today);
        const lines: string[] = [];
        for (const o of overdue)
          lines.push(
            t(lang, "overdueLine", {
              label: o.label,
              amount: o.amount,
              date: o.date,
            })
          );
        for (const r of stats.staleRepairs)
          lines.push(t(lang, "repairAttentionLine", { label: r.label }));
        await ctx.reply(
          lines.length
            ? `${t(lang, "needsAttention")}\n${lines.join("\n")}`
            : t(lang, "nothingOverdue")
        );
        return;
      }

      case "dashboard": {
        const s = await getDashboardStats(tenantId, property.id);
        await ctx.reply(
          [
            `🏠 ${property.houseNickname || property.houseName || t(lang, "home")}`,
            t(lang, "dashboardSpent", { amount: s.monthSpent }),
            t(lang, "dashboardOpenRepairs", { count: s.openRepairsCount }),
          ].join("\n")
        );
        return;
      }

      case "upcoming": {
        const today = todayInTz(property.timezone);
        const events = await getCalendarEvents(property.id, today);
        const soon = events
          .filter(e => e.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 10);
        await ctx.reply(
          soon.length
            ? `${t(lang, "upcomingHeader")}\n${soon
                .map(e =>
                  t(lang, "upcomingLine", { date: e.date, title: e.title })
                )
                .join("\n")}`
            : t(lang, "nothingUpcoming")
        );
        return;
      }

      case "addexpense": {
        const name = parsed.name.slice(0, 40);
        const kb = new InlineKeyboard()
          .text(t(lang, "btnConfirm"), `ax|${parsed.amount}|${name}`)
          .text(t(lang, "btnCancel"), "cancel");
        await ctx.reply(
          t(lang, "confirmAdd", { name, amount: parsed.amount }),
          { reply_markup: kb }
        );
        return;
      }

      case "paid": {
        const expense = await getExpenseById(parsed.id, tenantId);
        if (!expense) {
          await ctx.reply(t(lang, "noExpenseId"));
          return;
        }
        await updateExpense(parsed.id, tenantId, {
          isPaid: true,
          paidDate: todayInTz(property.timezone),
        });
        await ctx.reply(t(lang, "markedPaid", { name: expense.name }));
        return;
      }

      case "unknown":
        await ctx.reply(`${t(lang, "unknownCommand")} ${t(lang, "help")}`);
        return;

      default:
        await ctx.reply(t(lang, "help"));
    }
  });

  b.catch(err => logger.error({ err }, "[telegram] handler error"));
}
