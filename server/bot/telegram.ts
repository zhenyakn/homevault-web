/**
 * Telegram bot (grammY) — the two-way interface: consume + update HomeVault data
 * from chat. Account linking uses the link-code flow; read commands query the
 * DB; write commands (/addexpense, /paid) confirm before committing. Pure
 * command parsing lives in commands.ts (unit-tested); this module is the I/O.
 */

import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import type { RequestHandler } from "express";
import { nanoid } from "nanoid";
import { logger } from "../_core/logger";
import { getNotificationConfig, isFromEnv } from "../notifications/config";
import {
  getPublicBaseUrl,
  getTelegramWebhookSecret,
} from "../_core/integrationsConfig";
import {
  parseCommand,
  parseCallback,
  menuCallback,
  payCallback,
  addExpenseCallback,
  type MenuAction,
} from "./commands";
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

type Session = {
  user: Awaited<ReturnType<typeof getUserByTelegramChatId>> & object;
  property: Awaited<ReturnType<typeof getPropertiesByUser>>[number];
  tenantId: number;
  lang: string;
};

/**
 * Resolve everything a handler needs for a chat: the linked user, their first
 * property, the tenant scope and the reply language. Returns null when the chat
 * isn't linked to a user with a usable property — callers then show the
 * "link your account" / "unlinked" message.
 */
async function resolveSession(chatId: string): Promise<Session | null> {
  const user = await getUserByTelegramChatId(chatId);
  if (!user) return null;
  const props = await getPropertiesByUser(user.id);
  const property = props[0];
  if (!property || property.tenantId == null) return null;
  return {
    user,
    property,
    tenantId: property.tenantId,
    lang: normalizeLanguage(user.language),
  };
}

/** The linked user's preferred language for this chat (defaults to en). */
async function resolveLang(chatId: string): Promise<string> {
  const user = await getUserByTelegramChatId(chatId);
  return normalizeLanguage(user?.language);
}

// ── Inline keyboards & rendered messages ─────────────────────────────────────

/** The main menu: every action a tap away, no typing or ids required. */
function mainMenu(lang: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "btnAddExpense"), menuCallback("add"))
    .text(t(lang, "btnPayBill"), menuCallback("pay"))
    .row()
    .text(t(lang, "btnOverdue"), menuCallback("overdue"))
    .text(t(lang, "btnDashboard"), menuCallback("dashboard"))
    .row()
    .text(t(lang, "btnUpcoming"), menuCallback("upcoming"));
}

/** A single "⬅️ Menu" button to return to the main menu. */
function backToMenu(lang: string): InlineKeyboard {
  return new InlineKeyboard().text(t(lang, "btnMenu"), menuCallback("home"));
}

/** "Needs attention" text — overdue bills + repairs that need looking at. */
async function overdueText(s: Session): Promise<string> {
  const today = todayInTz(s.property.timezone);
  const [expenses, stats] = await Promise.all([
    getExpenses(s.tenantId, s.property.id),
    getDashboardStats(s.tenantId, s.property.id),
  ]);
  const overdue = getOverdueExpenses(expenses, today);
  const lines: string[] = [];
  for (const o of overdue)
    lines.push(
      t(s.lang, "overdueLine", { label: o.label, amount: o.amount, date: o.date })
    );
  for (const r of stats.staleRepairs)
    lines.push(t(s.lang, "repairAttentionLine", { label: r.label }));
  return lines.length
    ? `${t(s.lang, "needsAttention")}\n${lines.join("\n")}`
    : t(s.lang, "nothingOverdue");
}

/** This-month dashboard snapshot. */
async function dashboardText(s: Session): Promise<string> {
  const stats = await getDashboardStats(s.tenantId, s.property.id);
  return [
    `🏠 ${s.property.houseNickname || s.property.houseName || t(s.lang, "home")}`,
    t(s.lang, "dashboardSpent", { amount: stats.monthSpent }),
    t(s.lang, "dashboardOpenRepairs", { count: stats.openRepairsCount }),
  ].join("\n");
}

/** Next calendar events & due dates. */
async function upcomingText(s: Session): Promise<string> {
  const today = todayInTz(s.property.timezone);
  const events = await getCalendarEvents(s.property.id, today);
  const soon = events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
  return soon.length
    ? `${t(s.lang, "upcomingHeader")}\n${soon
        .map(e => t(s.lang, "upcomingLine", { date: e.date, title: e.title }))
        .join("\n")}`
    : t(s.lang, "nothingUpcoming");
}

/**
 * Build the "Pay a bill" picker: every unpaid expense as its own tappable button
 * (oldest/overdue first), so the user marks a bill paid without ever seeing or
 * typing an id. Capped at 10 buttons to stay readable.
 */
async function payListMessage(
  s: Session
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const all = await getExpenses(s.tenantId, s.property.id);
  const unpaid = all
    .filter(e => !e.isPaid)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
  if (!unpaid.length) {
    return { text: t(s.lang, "nothingToPay"), keyboard: backToMenu(s.lang) };
  }
  const kb = new InlineKeyboard();
  for (const e of unpaid) {
    kb.text(`${e.name} — ${e.amount}`, payCallback(e.id)).row();
  }
  kb.text(t(s.lang, "btnMenu"), menuCallback("home"));
  return { text: t(s.lang, "payPickTitle"), keyboard: kb };
}

/**
 * Render a tapped menu action by editing the message in place (so the chat
 * doesn't fill up with menus). "add" only prompts the user to type the amount +
 * name — there's no native numeric keypad, so the amount must be typed — and the
 * next free-text message is parsed as the expense.
 */
async function renderMenuAction(
  ctx: Context,
  s: Session,
  action: MenuAction
): Promise<void> {
  switch (action) {
    case "home":
      await ctx.editMessageText(t(s.lang, "menuTitle"), {
        reply_markup: mainMenu(s.lang),
      });
      return;
    case "add":
      await ctx.editMessageText(t(s.lang, "addExpensePrompt"), {
        reply_markup: backToMenu(s.lang),
      });
      return;
    case "pay": {
      const { text, keyboard } = await payListMessage(s);
      await ctx.editMessageText(text, { reply_markup: keyboard });
      return;
    }
    case "overdue":
      await ctx.editMessageText(await overdueText(s), {
        reply_markup: backToMenu(s.lang),
      });
      return;
    case "dashboard":
      await ctx.editMessageText(await dashboardText(s), {
        reply_markup: backToMenu(s.lang),
      });
      return;
    case "upcoming":
      await ctx.editMessageText(await upcomingText(s), {
        reply_markup: backToMenu(s.lang),
      });
      return;
  }
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
 *
 * `dropPending` discards the backlog Telegram queued before we connected, so the
 * bot doesn't replay old messages and answer them (e.g. "not linked") right
 * after setup. Pass it on a deliberate connect (token saved / Reconnect) — NOT
 * on boot, where a routine restart shouldn't silently drop real messages.
 */
export async function syncTelegramDelivery(
  opts: { dropPending?: boolean } = {}
): Promise<DeliverySyncResult> {
  const dropPending = opts.dropPending ?? false;
  const b = getBot();
  if (!b) {
    stopPolling();
    return { ok: false, reason: "no-token" };
  }
  // Publish the slash-command menu so Telegram shows suggestions when the user
  // taps "/". Best-effort: a failure here must not block connecting the bot.
  void setBotCommands(b);
  const base = getPublicBaseUrl().replace(/\/+$/, "");
  try {
    if (chooseDeliveryMode(base) === "webhook") {
      // Switching to webhook — make sure no polling loop is competing for
      // getUpdates (Telegram allows only one).
      stopPolling();
      const url = `${base}/api/bot/telegram`;
      await b.api.setWebhook(url, {
        secret_token: getTelegramWebhookSecret() || undefined,
        drop_pending_updates: dropPending,
      });
      return { ok: true, mode: "webhook", url };
    }
    // Polling mode: drop any webhook (else getUpdates returns 409), then start
    // the loop unless this exact bot is already polling.
    if (pollingBot !== b) {
      stopPolling();
      await b.api.deleteWebhook({ drop_pending_updates: dropPending });
      pollingBot = b;
      void b
        .start({
          drop_pending_updates: dropPending,
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

export type TelegramDiagnostics = {
  tokenConfigured: boolean;
  tokenFromEnv: boolean;
  mode: DeliveryMode | "none";
  /** getMe result — the bot's identity, or the raw error from Telegram. */
  bot: { id: number; username: string | null; name: string | null } | null;
  botError: string | null;
  /** getWebhookInfo — registration + the last delivery error Telegram saw. */
  webhook: {
    url: string | null;
    pendingUpdateCount: number;
    lastErrorMessage: string | null;
    lastErrorDate: string | null;
    ipAddress: string | null;
  } | null;
  webhookError: string | null;
};

/**
 * One-shot live diagnostics for the Settings UI: probes getMe + getWebhookInfo
 * and returns everything as plain, JSON-safe data (errors as strings). Lets an
 * admin see the bot's real identity, the active transport, and — crucially — the
 * last error Telegram itself recorded, without digging through server logs.
 */
export async function getTelegramDiagnostics(): Promise<TelegramDiagnostics> {
  const tokenConfigured = Boolean(getNotificationConfig().telegramBotToken);
  const tokenFromEnv = isFromEnv("telegramBotToken");
  const b = getBot();
  if (!b) {
    return {
      tokenConfigured,
      tokenFromEnv,
      mode: "none",
      bot: null,
      botError: null,
      webhook: null,
      webhookError: null,
    };
  }

  let bot: TelegramDiagnostics["bot"] = null;
  let botError: string | null = null;
  try {
    const me = await b.api.getMe();
    bot = {
      id: me.id,
      username: me.username ?? null,
      name: me.first_name ?? null,
    };
  } catch (err) {
    botError = errText(err);
  }

  let webhook: TelegramDiagnostics["webhook"] = null;
  let webhookError: string | null = null;
  try {
    const info = await b.api.getWebhookInfo();
    webhook = {
      url: info.url || null,
      pendingUpdateCount: info.pending_update_count ?? 0,
      lastErrorMessage: info.last_error_message || null,
      lastErrorDate: info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
      ipAddress: info.ip_address || null,
    };
  } catch (err) {
    webhookError = errText(err);
  }

  const mode: DeliveryMode | "none" =
    pollingBot === b ? "polling" : webhook?.url ? "webhook" : "none";

  return {
    tokenConfigured,
    tokenFromEnv,
    mode,
    bot,
    botError,
    webhook,
    webhookError,
  };
}

/**
 * Publish the slash-command menu shown when a user taps "/" in Telegram. Natural
 * language is the primary interface now, but advertising the classic commands
 * keeps them discoverable. Best-effort and never throws.
 */
async function setBotCommands(b: Bot): Promise<void> {
  try {
    await b.api.setMyCommands([
      { command: "menu", description: "Open the menu (buttons for everything)" },
      { command: "pay", description: "Pay a bill — pick from your bills" },
      { command: "overdue", description: "Items needing attention" },
      { command: "dashboard", description: "This month at a glance" },
      { command: "upcoming", description: "Events & due dates" },
      { command: "help", description: "What I can do" },
    ]);
  } catch (err) {
    logger.warn({ err: errText(err) }, "[telegram] failed to set command menu");
  }
}

function registerHandlers(b: Bot) {
  // ── Inline-button taps ─────────────────────────────────────────────────────
  // The bot is button-first: menu navigation, paying a bill (by tapping it, no
  // id), and confirming an add-expense all arrive here as callback queries.
  b.on("callback_query:data", async ctx => {
    const chatId = String(ctx.chat?.id ?? "");
    const cb = parseCallback(ctx.callbackQuery.data);

    // Always ack the tap first so Telegram stops the button's loading spinner.
    await ctx.answerCallbackQuery();

    if (cb.kind === "cancel") {
      await ctx.editMessageText(t(await resolveLang(chatId), "cancelled"));
      return;
    }

    const s = await resolveSession(chatId);
    if (!s) {
      await ctx.editMessageText(t(await resolveLang(chatId), "accountUnlinked"));
      return;
    }

    if (cb.kind === "menu") {
      await renderMenuAction(ctx, s, cb.action);
      return;
    }

    if (cb.kind === "pay") {
      const expense = await getExpenseById(cb.id, s.tenantId);
      if (!expense) {
        await ctx.editMessageText(t(s.lang, "noExpenseId"), {
          reply_markup: backToMenu(s.lang),
        });
        return;
      }
      await updateExpense(cb.id, s.tenantId, {
        isPaid: true,
        paidDate: todayInTz(s.property.timezone),
      });
      // Offer to pay another bill or return to the menu — keeps it interactive.
      const kb = new InlineKeyboard()
        .text(t(s.lang, "btnPayBill"), menuCallback("pay"))
        .text(t(s.lang, "btnMenu"), menuCallback("home"));
      await ctx.editMessageText(t(s.lang, "markedPaid", { name: expense.name }), {
        reply_markup: kb,
      });
      return;
    }

    if (cb.kind === "addexpense") {
      await createExpense({
        id: nanoid(),
        propertyId: s.property.id,
        ownerId: s.user.id,
        tenantId: s.tenantId,
        name: cb.name,
        amount: Math.round(cb.amount),
        category: "Other",
        date: todayInTz(s.property.timezone),
      } as any);
      await ctx.editMessageText(
        t(s.lang, "expenseAdded", {
          name: cb.name,
          amount: Math.round(cb.amount),
        }),
        { reply_markup: backToMenu(s.lang) }
      );
      return;
    }
  });

  // ── Free-text messages ─────────────────────────────────────────────────────
  b.on("message:text", async ctx => {
    const chatId = String(ctx.chat.id);
    const parsed = parseCommand(ctx.message.text);
    // Resolve the chat's user once so every reply can be localized.
    const linkedUser = await getUserByTelegramChatId(chatId);
    const lang = normalizeLanguage(linkedUser?.language);

    // Consume a link code and bind this chat to its user, then drop the user
    // straight into the menu. The linking user may differ from the previously-
    // unlinked chat, so the reply re-resolves language from the now-linked row.
    const tryLink = async (code: string): Promise<boolean> => {
      const userId = await consumeTelegramLinkCode(code);
      if (!userId) return false;
      await setTelegramChatId(userId, chatId);
      const newLang = await resolveLang(chatId);
      await ctx.reply(t(newLang, "linkSuccess"), {
        reply_markup: mainMenu(newLang),
      });
      return true;
    };

    switch (parsed.type) {
      case "start":
        // Deep link (t.me/<bot>?start=<code>) → link in one tap; bare /start
        // just opens the menu. An invalid/expired code falls through to it too.
        if (parsed.code && (await tryLink(parsed.code))) return;
        await ctx.reply(t(lang, "menuTitle"), { reply_markup: mainMenu(lang) });
        return;

      case "help":
      case "menu":
        await ctx.reply(t(lang, "menuTitle"), { reply_markup: mainMenu(lang) });
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
    const s = await resolveSession(chatId);
    if (!s) {
      await ctx.reply(t(lang, "notLinked"));
      return;
    }

    switch (parsed.type) {
      case "overdue":
        await ctx.reply(await overdueText(s), {
          reply_markup: backToMenu(s.lang),
        });
        return;

      case "dashboard":
        await ctx.reply(await dashboardText(s), {
          reply_markup: backToMenu(s.lang),
        });
        return;

      case "upcoming":
        await ctx.reply(await upcomingText(s), {
          reply_markup: backToMenu(s.lang),
        });
        return;

      case "paylist": {
        const { text, keyboard } = await payListMessage(s);
        await ctx.reply(text, { reply_markup: keyboard });
        return;
      }

      case "addexpense": {
        const name = parsed.name.slice(0, 40);
        const kb = new InlineKeyboard()
          .text(t(s.lang, "btnConfirm"), addExpenseCallback(parsed.amount, name))
          .text(t(s.lang, "btnCancel"), "cancel");
        await ctx.reply(t(s.lang, "confirmAdd", { name, amount: parsed.amount }), {
          reply_markup: kb,
        });
        return;
      }

      case "paid": {
        // A typed "mark <id> paid" still works, but most users tap the bill in
        // the pay list instead.
        const expense = await getExpenseById(parsed.id, s.tenantId);
        if (!expense) {
          await ctx.reply(t(s.lang, "noExpenseId"), {
            reply_markup: backToMenu(s.lang),
          });
          return;
        }
        await updateExpense(parsed.id, s.tenantId, {
          isPaid: true,
          paidDate: todayInTz(s.property.timezone),
        });
        await ctx.reply(t(s.lang, "markedPaid", { name: expense.name }), {
          reply_markup: backToMenu(s.lang),
        });
        return;
      }

      case "unknown":
      default:
        await ctx.reply(t(s.lang, "notUnderstood"), {
          reply_markup: mainMenu(s.lang),
        });
    }
  });

  // grammy wraps handler failures in a BotError that carries the whole Context
  // (deeply self-referential). Log only its message — never the object — so a
  // cyclic structure can't reach a JSON serializer.
  b.catch(err =>
    logger.error({ err: errText(err) }, "[telegram] handler error")
  );
}
