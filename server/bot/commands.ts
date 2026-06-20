/**
 * Telegram bot command parsing — PURE. Maps an inbound chat message to a typed
 * command the handler can execute against the DB. No network or DB here so the
 * grammar is unit-testable (see commands.test.ts).
 *
 * Two grammars feed the same `ParsedCommand` shape:
 *  1. Classic slash commands ("/addexpense 100 Water bill") — explicit, exact.
 *  2. Natural language ("spent 100 on the water bill", "what's overdue?",
 *     "mark exp-7 paid") — so users don't have to memorize or type a slash
 *     command every time. The natural-language layer recognizes the same set of
 *     actions in English, Russian and Hebrew (the bot's supported languages).
 *
 * Slash commands always win; free text falls through to the NL parser.
 */

export type ParsedCommand =
  | { type: "start"; code?: string }
  | { type: "help" }
  | { type: "link"; code: string }
  | { type: "overdue" }
  | { type: "dashboard" }
  | { type: "upcoming" }
  | { type: "menu" }
  | { type: "paylist" }
  | { type: "addexpense"; amount: number; name: string }
  | { type: "paid"; id: string }
  | { type: "invalid"; command: string; reasonKey: string }
  | { type: "unknown"; command: string };

/**
 * Parse a raw inbound message. Commands starting with "/" use the explicit
 * grammar (command word is case-insensitive, a Telegram "@botname" suffix is
 * stripped). Anything else is run through the natural-language parser so plain
 * chat like "spent 50 on groceries" or "what needs attention?" still works.
 */
export function parseCommand(raw: string): ParsedCommand {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { type: "unknown", command: "" };

  if (!trimmed.startsWith("/")) {
    return parseNaturalLanguage(trimmed);
  }

  // Split off the command word from its arguments.
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  // "/cmd@BotName" → "cmd"
  const cmd = head.slice(1).split("@")[0].toLowerCase();

  switch (cmd) {
    case "start":
      // A deep link (t.me/<bot>?start=<code>) delivers "/start <code>", letting
      // the user link in one tap. A bare "/start" carries no code.
      return rest
        ? { type: "start", code: rest.split(/\s+/)[0] }
        : { type: "start" };
    case "help":
      return { type: "help" };
    case "menu":
      return { type: "menu" };
    case "pay":
      return { type: "paylist" };
    case "overdue":
      return { type: "overdue" };
    case "dashboard":
      return { type: "dashboard" };
    case "upcoming":
      return { type: "upcoming" };

    case "link": {
      if (!rest) {
        return { type: "invalid", command: "link", reasonKey: "usage.link" };
      }
      return { type: "link", code: rest.split(/\s+/)[0] };
    }

    case "paid": {
      if (!rest) {
        return { type: "invalid", command: "paid", reasonKey: "usage.paid" };
      }
      return { type: "paid", id: rest.split(/\s+/)[0] };
    }

    case "expense":
    case "addexpense": {
      return parseAddExpenseArgs(rest);
    }

    default:
      return { type: "unknown", command: cmd };
  }
}

/** Shared validation for the "/addexpense <amount> <name>" argument string. */
function parseAddExpenseArgs(rest: string): ParsedCommand {
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return {
      type: "invalid",
      command: "addexpense",
      reasonKey: "usage.addexpense",
    };
  }
  const amount = parseAmountToken(parts[0]);
  if (amount === null) {
    return {
      type: "invalid",
      command: "addexpense",
      reasonKey: "usage.amountPositive",
    };
  }
  const name = parts.slice(1).join(" ");
  return { type: "addexpense", amount, name };
}

// ---------------------------------------------------------------------------
// Natural-language layer
// ---------------------------------------------------------------------------

/**
 * Keyword sets for the read-only intents, across the bot's three languages.
 * Matched as whole words / phrases against a normalized (lowercased,
 * punctuation-stripped) copy of the message. Order matters: the first intent
 * whose keyword is present wins, so list more specific intents first.
 */
const READ_INTENTS: { type: "help" | "overdue" | "upcoming" | "dashboard"; words: string[] }[] =
  [
    {
      type: "help",
      words: [
        "help",
        "commands",
        "command",
        "what can you do",
        "what can you",
        "menu",
        "помощь",
        "команды",
        "команда",
        "что ты умеешь",
        "עזרה",
        "פקודות",
      ],
    },
    {
      type: "overdue",
      words: [
        "overdue",
        "needs attention",
        "attention",
        "whats due",
        "what is due",
        "due",
        "unpaid",
        "owe",
        "late",
        "outstanding",
        "просрочено",
        "просрочка",
        "просроченные",
        "долг",
        "долги",
        "что надо оплатить",
        "איחור",
        "פיגור",
        "לתשלום",
      ],
    },
    {
      type: "upcoming",
      words: [
        "upcoming",
        "calendar",
        "events",
        "event",
        "schedule",
        "agenda",
        "whats next",
        "what is next",
        "soon",
        "предстоящее",
        "предстоящие",
        "календарь",
        "события",
        "расписание",
        "скоро",
        "קרוב",
        "יומן",
        "אירועים",
      ],
    },
    {
      type: "dashboard",
      words: [
        "dashboard",
        "summary",
        "overview",
        "this month",
        "how much",
        "stats",
        "status",
        "сводка",
        "обзор",
        "итоги",
        "сколько",
        "за месяц",
        "סיכום",
        "סקירה",
        "החודש",
      ],
    },
  ];

/**
 * Verbs that signal "log an expense" even when the trailing name is otherwise
 * ambiguous, plus connector/filler words stripped from the extracted name so
 * "spent 50 on the water bill" becomes the clean name "water bill". Multilingual
 * to match READ_INTENTS coverage.
 */
const EXPENSE_VERBS = [
  "add",
  "log",
  "record",
  "spent",
  "spend",
  "paid",
  "pay",
  "bought",
  "buy",
  "expense",
  "потратил",
  "потратила",
  "потрать",
  "добавь",
  "расход",
  "купил",
  "купила",
  "оплатил",
  "оплатила",
  "שילמתי",
  "הוצאה",
  "קניתי",
];

const EXPENSE_FILLER = new Set([
  ...EXPENSE_VERBS,
  "expenses",
  "spending",
  "new",
  "a",
  "an",
  "the",
  "for",
  "on",
  "of",
  "to",
  "i",
  "me",
  "my",
  "it",
  "на",
  "за",
  "новый",
  "מ",
  "ל",
  "על",
]);

/** "I want to pay a bill" phrasings (no id) → open the tappable bill list. */
const PAY_WORDS = [
  "pay a bill",
  "pay bill",
  "pay bills",
  "mark paid",
  "mark as paid",
  "pay",
  "оплатить",
  "оплата",
  "заплатить",
  "שלם",
  "לשלם",
  "תשלום",
];

/** "Show me the menu / start over" phrasings → render the main menu. */
const MENU_WORDS = [
  "menu",
  "main menu",
  "start over",
  "options",
  "what can i do",
  "меню",
  "начать",
  "תפריט",
];

/**
 * Normalize for keyword matching: lowercase, replace ASCII punctuation with
 * spaces (so "what's overdue?" → "what s overdue"), collapse whitespace.
 * Non-ASCII letters (Cyrillic, Hebrew) are left untouched.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[!-/:-@[-`{-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a positive money amount from a single token. Accepts a leading or
 * trailing currency symbol ($, €, £, ₪, ₽) and a comma OR dot decimal separator.
 * Returns null when the token isn't a usable positive number.
 */
function parseAmountToken(token: string): number | null {
  const cleaned = token.replace(/[$€£₪₽]/g, "").replace(",", ".").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pull the first money amount out of free text. Returns the parsed amount and
 * the remaining words (amount token removed) for use as the expense name, or
 * null when no number is present.
 */
function extractAmount(text: string): { amount: number; rest: string } | null {
  // A number with an optional adjacent currency symbol, e.g. "$50", "50₪", "12.5".
  const re = /[$€£₪₽]?\s?\d+(?:[.,]\d+)?\s?[$€£₪₽]?/;
  const match = re.exec(text);
  if (!match) return null;
  const amount = parseAmountToken(match[0]);
  if (amount === null) return null;
  const rest = (text.slice(0, match.index) + " " + text.slice(match.index + match[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { amount, rest };
}

/** Strip filler/verb/connector words, leaving the human-meaningful name. */
function cleanExpenseName(rest: string): string {
  return rest
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !EXPENSE_FILLER.has(w.toLowerCase()))
    .join(" ")
    .trim();
}

/**
 * Recognize "mark this expense as paid" phrasings that carry an expense id:
 *   "paid exp-7" · "mark exp-7 paid" · "exp-7 is paid" · "exp-7 done"
 * The id must be non-numeric so "paid 30 for gas" is read as an expense, not a
 * payment. Returns null when no such pattern is present.
 */
function matchMarkPaid(text: string): ParsedCommand | null {
  // An expense id has letters and at least one digit or hyphen (e.g. "exp-7",
  // a nanoid). Requiring a digit/hyphen keeps plain words ("paid water",
  // "what is paid") from being mistaken for an id.
  const isId = (tok: string | undefined): tok is string =>
    !!tok && /[a-z]/i.test(tok) && /[0-9-]/.test(tok) && parseAmountToken(tok) === null;

  // "paid <id>" / "pay <id>"
  let m = /^(?:paid|pay|оплати(?:ть|л|ла)?|оплачен[оаы]?)\s+(\S+)/i.exec(text);
  if (m && isId(m[1])) return { type: "paid", id: stripPunct(m[1]) };

  // "mark <id> [as] paid/done"
  m = /\bmark\s+(\S+)\s+(?:as\s+)?(?:paid|done)\b/i.exec(text);
  if (m && isId(m[1])) return { type: "paid", id: stripPunct(m[1]) };

  // "<id> is/as paid" / "<id> done"
  m = /^(\S+)\s+(?:is\s+|as\s+)?(?:paid|done|оплачен[оаы]?)\b/i.exec(text);
  if (m && isId(m[1])) return { type: "paid", id: stripPunct(m[1]) };

  return null;
}

function stripPunct(tok: string): string {
  return tok.replace(/^[^\w]+/, "").replace(/[^\w-]+$/, "");
}

/** Does the (normalized) text contain an explicit expense verb? */
function hasExpenseVerb(norm: string): boolean {
  const padded = ` ${norm} `;
  return EXPENSE_VERBS.some(v => padded.includes(` ${v} `));
}

/**
 * Interpret free chat text. Resolution order is chosen so the common cases never
 * collide:
 *   1. "mark paid" phrasings carrying a non-numeric id.
 *   2. An amount present → log an expense (the headline feature).
 *   3. A read-intent keyword (overdue / dashboard / upcoming / help).
 *   4. Otherwise: unknown (handler replies with a friendly hint + help).
 */
export function parseNaturalLanguage(text: string): ParsedCommand {
  const norm = normalize(text);

  // 1. Mark-an-expense-paid, which must be checked before the amount path so a
  //    numeric id (none today) wouldn't be needed; ids are non-numeric anyway.
  const paid = matchMarkPaid(text);
  if (paid) return paid;

  // 2. Anything with a money amount is an expense to log.
  const money = extractAmount(text);
  if (money) {
    const name = cleanExpenseName(money.rest);
    if (name) return { type: "addexpense", amount: money.amount, name };
    // Amount but no usable name — only treat as a (malformed) expense when the
    // user clearly meant to log one; otherwise fall through (e.g. "next 7").
    if (hasExpenseVerb(norm)) {
      return {
        type: "invalid",
        command: "addexpense",
        reasonKey: "usage.addexpense",
      };
    }
  }

  const padded = ` ${norm} `;
  const hasWord = (words: string[]) =>
    words.some(w => padded.includes(` ${w} `));

  // 3. "Pay a bill" with no specific id → show the tappable list of bills so the
  //    user never has to know an id.
  if (hasWord(PAY_WORDS)) return { type: "paylist" };

  // 4. Show the main menu.
  if (hasWord(MENU_WORDS)) return { type: "menu" };

  // 5. Read-only intents by keyword.
  for (const intent of READ_INTENTS) {
    if (hasWord(intent.words)) return { type: intent.type };
  }

  // 6. Give up — surface the original text so the handler can hint with help.
  return { type: "unknown", command: text };
}

// ---------------------------------------------------------------------------
// Inline-button callbacks
// ---------------------------------------------------------------------------

/**
 * The bot's primary interface is tappable inline buttons, so every action can be
 * driven without typing a command or knowing an id. Buttons carry a short
 * `callback_data` string (Telegram caps it at 64 bytes); these helpers build and
 * parse those strings so the encoding is in one place and unit-testable.
 *
 * Encodings:
 *   "cancel"                 — dismiss a pending confirm
 *   "menu:<action>"          — navigate the menu (home/add/pay/overdue/…)
 *   "pay:<id>"               — mark expense <id> paid (id comes from a button,
 *                              never typed, so the user never sees it)
 *   "ax|<amount>|<name>"     — confirm an add-expense write
 */
export type MenuAction =
  | "home"
  | "add"
  | "pay"
  | "overdue"
  | "dashboard"
  | "upcoming";

export type Callback =
  | { kind: "cancel" }
  | { kind: "menu"; action: MenuAction }
  | { kind: "pay"; id: string }
  | { kind: "addexpense"; amount: number; name: string }
  | { kind: "unknown" };

const MENU_ACTIONS: MenuAction[] = [
  "home",
  "add",
  "pay",
  "overdue",
  "dashboard",
  "upcoming",
];

export function menuCallback(action: MenuAction): string {
  return `menu:${action}`;
}

export function payCallback(id: string): string {
  return `pay:${id}`;
}

export function addExpenseCallback(amount: number, name: string): string {
  return `ax|${amount}|${name}`;
}

export function parseCallback(data: string): Callback {
  if (data === "cancel") return { kind: "cancel" };

  if (data.startsWith("menu:")) {
    const action = data.slice("menu:".length);
    if ((MENU_ACTIONS as string[]).includes(action)) {
      return { kind: "menu", action: action as MenuAction };
    }
    return { kind: "unknown" };
  }

  if (data.startsWith("pay:")) {
    const id = data.slice("pay:".length);
    return id ? { kind: "pay", id } : { kind: "unknown" };
  }

  if (data.startsWith("ax|")) {
    const [, amountStr, ...nameParts] = data.split("|");
    const amount = Number(amountStr);
    const name = nameParts.join("|");
    if (Number.isFinite(amount) && amount > 0 && name) {
      return { kind: "addexpense", amount, name };
    }
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}

