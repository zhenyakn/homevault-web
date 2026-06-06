/**
 * Telegram bot (grammY) — the two-way interface: consume + update HomeVault data
 * from chat. Account linking uses the link-code flow; read commands query the
 * DB; write commands (/addexpense, /paid) confirm before committing. Pure
 * command parsing lives in commands.ts (unit-tested); this module is the I/O.
 */

import { Bot, InlineKeyboard } from "grammy";
import { nanoid } from "nanoid";
import { ENV } from "../_core/env";
import { logger } from "../_core/logger";
import { parseCommand } from "./commands";
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

const HELP = [
  "HomeVault bot commands:",
  "/overdue — items needing attention",
  "/dashboard — this month at a glance",
  "/upcoming — events & due dates (next 7 days)",
  "/addexpense <amount> <name> — log an expense",
  "/paid <id> — mark an expense paid",
  "/link <code> — connect your account",
].join("\n");

async function resolveContext(chatId: string) {
  const user = await getUserByTelegramChatId(chatId);
  if (!user) return null;
  const props = await getPropertiesByUser(user.id);
  const property = props[0];
  if (!property) return null;
  return { user, property };
}

let bot: Bot | null = null;

/** Lazily construct the bot. Returns null when no token is configured. */
export function getBot(): Bot | null {
  if (bot) return bot;
  if (!ENV.telegramBotToken) return null;
  bot = new Bot(ENV.telegramBotToken);
  registerHandlers(bot);
  return bot;
}

function registerHandlers(b: Bot) {
  // Confirm callback for /addexpense → "ax|<amount>|<name>"
  b.on("callback_query:data", async ctx => {
    const data = ctx.callbackQuery.data;
    const chatId = String(ctx.chat?.id ?? "");
    if (data === "cancel") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Cancelled. Nothing was added.");
      return;
    }
    if (data.startsWith("ax|")) {
      const [, amountStr, ...nameParts] = data.split("|");
      const amount = Number(amountStr);
      const name = nameParts.join("|");
      const context = await resolveContext(chatId);
      await ctx.answerCallbackQuery();
      if (!context) {
        await ctx.editMessageText("Your account isn't linked anymore.");
        return;
      }
      await createExpense({
        id: nanoid(),
        propertyId: context.property.id,
        ownerId: context.user.id,
        name,
        amount: Math.round(amount),
        category: "Other",
        date: todayInTz(context.property.timezone),
      } as any);
      await ctx.editMessageText(`✅ Added “${name}” (${Math.round(amount)}).`);
    }
  });

  b.on("message:text", async ctx => {
    const chatId = String(ctx.chat.id);
    const parsed = parseCommand(ctx.message.text);

    switch (parsed.type) {
      case "start":
      case "help":
        await ctx.reply(HELP);
        return;

      case "link": {
        const userId = await consumeTelegramLinkCode(parsed.code);
        if (!userId) {
          await ctx.reply("That link code is invalid or expired.");
          return;
        }
        await setTelegramChatId(userId, chatId);
        await ctx.reply("✅ Account linked! Try /overdue or /dashboard.");
        return;
      }

      case "invalid":
        await ctx.reply(parsed.reason);
        return;
    }

    // Everything below requires a linked account.
    const context = await resolveContext(chatId);
    if (!context) {
      await ctx.reply(
        "Your chat isn't linked yet. Open HomeVault → Settings → Integrations, create a Telegram link code, and send: /link <code>"
      );
      return;
    }
    const { user, property } = context;

    switch (parsed.type) {
      case "overdue": {
        const today = todayInTz(property.timezone);
        const [expenses, stats] = await Promise.all([
          getExpenses(user.id, property.id),
          getDashboardStats(user.id, property.id),
        ]);
        const overdue = getOverdueExpenses(expenses, today);
        const lines: string[] = [];
        for (const o of overdue)
          lines.push(`• ${o.label} (${o.amount}) — due ${o.date}`);
        for (const r of stats.staleRepairs)
          lines.push(`• ${r.label} — repair needs attention`);
        await ctx.reply(
          lines.length
            ? `Needs attention:\n${lines.join("\n")}`
            : "Nothing overdue. 🎉"
        );
        return;
      }

      case "dashboard": {
        const s = await getDashboardStats(user.id, property.id);
        await ctx.reply(
          [
            `🏠 ${property.houseNickname || property.houseName || "Home"}`,
            `Spent this month: ${s.monthSpent}`,
            `Open repairs: ${s.openRepairsCount}`,
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
            ? `📅 Upcoming:\n${soon.map(e => `• ${e.date} — ${e.title}`).join("\n")}`
            : "Nothing on the calendar soon."
        );
        return;
      }

      case "addexpense": {
        const name = parsed.name.slice(0, 40);
        const kb = new InlineKeyboard()
          .text("Confirm", `ax|${parsed.amount}|${name}`)
          .text("Cancel", "cancel");
        await ctx.reply(
          `Add expense “${name}” for ${parsed.amount} under Other?`,
          { reply_markup: kb }
        );
        return;
      }

      case "paid": {
        const expense = await getExpenseById(parsed.id);
        if (!expense || expense.ownerId !== user.id) {
          await ctx.reply("No expense with that id.");
          return;
        }
        await updateExpense(parsed.id, user.id, {
          isPaid: true,
          paidDate: todayInTz(property.timezone),
        });
        await ctx.reply(`✅ Marked “${expense.name}” as paid.`);
        return;
      }

      case "unknown":
        await ctx.reply(`Unknown command. ${HELP}`);
        return;

      default:
        await ctx.reply(HELP);
    }
  });

  b.catch(err => logger.error({ err }, "[telegram] handler error"));
}
