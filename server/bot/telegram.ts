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
// The bot instance currently running a long-polling loop (null when not
// polling). Tracked so we never call bot.start() twice and can stop it when the
// token changes or we switch to webhook mode.
let pollingBot: Bot | null = null;

/**
 * Lazily construct the bot. Returns null when no token is configured. The token
 * is resolved from the runtime notification config (env-first, then the
 * admin-set override). resetBot() clears the cache so a token saved in Settings
 * takes effect without a restart.
 */
export function getBot(): Bot | null {
  if (bot) return bot;
  const { telegramBotToken } = getNotificationConfig();
  if (!telegramBotToken) return null;
  bot = new Bot(telegramBotToken);
  registerHandlers(bot);
  return bot;
}

/** Stop the long-polling loop if one is running. Best-effort, never throws. */
function stopPolling(): void {
  if (!pollingBot) return;
  const stopping = pollingBot;
  pollingBot = null;
  void stopping.stop().catch(() => {});
}

/**
 * Drop the cached bot, username, webhook handler, and any polling loop so the
 * next getBot() picks up a freshly-configured token. Called after an admin saves
 * the token in Settings, letting a new bot take effect without a server restart.
 */
export function resetBot(): void {
  stopPolling();
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
    logger.warn(
      { err: errText(err) },
      "[telegram] failed to resolve bot username"
    );
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

export type DeliveryMode = "webhook" | "polling";

export type DeliverySyncResult =
  | { ok: true; mode: "webhook"; url: string }
  | { ok: true; mode: "polling" }
  | { ok: false; reason: "no-token" | "error"; detail?: string };

/**
 * Choose how the bot receives updates:
 *  - **webhook** when an explicit public HTTPS base URL is configured (Telegram
 *    pushes to us — efficient, the right choice for a public deployment);
 *  - **polling** otherwise (we pull from Telegram — needs no inbound URL, so it
 *    works out of the box on localhost / LAN / Home Assistant ingress).
 *
 * Pure + exported so the decision is unit-testable.
 */
export function chooseDeliveryMode(publicBaseUrl: string): DeliveryMode {
  const base = publicBaseUrl.trim().replace(/\/+$/, "");
  return /^https:\/\//i.test(base) ? "webhook" : "polling";
}

/**
 * Connect the bot so it actually receives commands, picking webhook or polling
 * automatically (see chooseDeliveryMode). Idempotent: re-running in the same
 * mode is a no-op; switching modes tears down the old one first. Best-effort —
 * returns a typed result instead of throwing so callers (boot, the Settings
 * mutation) can log or surface it without failing the surrounding operation.
 */
export async function syncTelegramDelivery(): Promise<DeliverySyncResult> {
  const b = getBot();
  if (!b) {
    stopPolling();
    return { ok: false, reason: "no-token" };
  }
  const base = getPublicBaseUrl().replace(/\/+$/, "");
  try {
    if (chooseDeliveryMode(base) === "webhook") {
      // Switching to webhook — make sure no polling loop is competing for
      // getUpdates (Telegram allows only one).
      stopPolling();
      const url = `${base}/api/bot/telegram`;
      await b.api.setWebhook(url, {
        secret_token: getTelegramWebhookSecret() || undefined,
      });
      return { ok: true, mode: "webhook", url };
    }
    // Polling mode: drop any webhook (else getUpdates returns 409), then start
    // the loop unless this exact bot is already polling. drop_pending_updates
    // skips the backlog Telegram queued while we were offline / on a webhook —
    // without it, starting polling replays old messages and the bot answers
    // them (e.g. "not linked"), which looks like spam right after setup.
    if (pollingBot !== b) {
      stopPolling();
      await b.api.deleteWebhook({ drop_pending_updates: true });
      pollingBot = b;
      void b
        .start({
          drop_pending_updates: true,
          onStart: () => logger.info("[telegram] long-polling started"),
        })
        .catch(err => {
          logger.warn({ err: errText(err) }, "[telegram] polling loop ended");
          if (pollingBot === b) pollingBot = null;
        });
    }
    return { ok: true, mode: "polling" };
  } catch (err) {
    logger.warn({ err: errText(err) }, "[telegram] failed to connect bot");
    return { ok: false, reason: "error", detail: errText(err) };
  }
}

export type DeliveryStatus = {
  /** "none" when no bot / unreachable. */
  mode: DeliveryMode | "none";
  /** The webhook URL Telegram delivers to (webhook mode only). */
  url: string | null;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
};

/**
 * Live delivery state for the Settings UI: whether the bot is connected and how.
 * A running polling loop is authoritative; otherwise we ask Telegram for the
 * webhook registration via getWebhookInfo.
 */
export async function getTelegramDeliveryStatus(): Promise<DeliveryStatus> {
  const b = getBot();
  if (!b)
    return {
      mode: "none",
      url: null,
      pendingUpdateCount: 0,
      lastErrorMessage: null,
    };
  if (pollingBot === b)
    return {
      mode: "polling",
      url: null,
      pendingUpdateCount: 0,
      lastErrorMessage: null,
    };
  try {
    const info = await b.api.getWebhookInfo();
    return {
      mode: info.url ? "webhook" : "none",
      url: info.url || null,
      pendingUpdateCount: info.pending_update_count ?? 0,
      lastErrorMessage: info.last_error_message || null,
    };
  } catch (err) {
    logger.warn(
      { err: errText(err) },
      "[telegram] failed to read delivery status"
    );
    return {
      mode: "none",
      url: null,
      pendingUpdateCount: 0,
      lastErrorMessage: null,
    };
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

  // grammy wraps handler failures in a BotError that carries the whole Context
  // (deeply self-referential). Log only its message — never the object — so a
  // cyclic structure can't reach a JSON serializer.
  b.catch(err =>
    logger.error({ err: errText(err) }, "[telegram] handler error")
  );
}
