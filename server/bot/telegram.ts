/**
 * Telegram bot (grammY) — the two-way interface: consume + update HomeVault data
 * from chat. Account linking uses the link-code flow; read commands query the
 * DB; write commands (/addexpense, /paid) confirm before committing. Pure
 * command parsing lives in commands.ts (unit-tested); this module is the I/O.
 */

import { Bot, InlineKeyboard } from "grammy";
import { nanoid } from "nanoid";
import { logger } from "../_core/logger";
import { getNotificationConfig } from "../notifications/config";
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
