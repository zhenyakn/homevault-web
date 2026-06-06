/**
 * Telegram bot command parsing — PURE. Maps an inbound chat message to a typed
 * command the handler can execute against the DB. No network or DB here so the
 * grammar is unit-testable (see commands.test.ts).
 */

export type ParsedCommand =
  | { type: "start" }
  | { type: "help" }
  | { type: "link"; code: string }
  | { type: "overdue" }
  | { type: "dashboard" }
  | { type: "upcoming" }
  | { type: "addexpense"; amount: number; name: string }
  | { type: "paid"; id: string }
  | { type: "invalid"; command: string; reason: string }
  | { type: "unknown"; command: string }
  | { type: "text"; text: string };

/**
 * Parse a raw inbound message. Commands start with "/"; the command word is
 * case-insensitive and a Telegram "@botname" suffix (e.g. "/help@HomeVaultBot")
 * is stripped. Non-command text returns a `text` command.
 */
export function parseCommand(raw: string): ParsedCommand {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { type: "unknown", command: "" };

  if (!trimmed.startsWith("/")) {
    return { type: "text", text: trimmed };
  }

  // Split off the command word from its arguments.
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  // "/cmd@BotName" → "cmd"
  const cmd = head.slice(1).split("@")[0].toLowerCase();

  switch (cmd) {
    case "start":
      return { type: "start" };
    case "help":
      return { type: "help" };
    case "overdue":
      return { type: "overdue" };
    case "dashboard":
      return { type: "dashboard" };
    case "upcoming":
      return { type: "upcoming" };

    case "link": {
      if (!rest) {
        return {
          type: "invalid",
          command: "link",
          reason: "Usage: /link <code>",
        };
      }
      return { type: "link", code: rest.split(/\s+/)[0] };
    }

    case "paid": {
      if (!rest) {
        return {
          type: "invalid",
          command: "paid",
          reason: "Usage: /paid <id>",
        };
      }
      return { type: "paid", id: rest.split(/\s+/)[0] };
    }

    case "addexpense": {
      const parts = rest.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        return {
          type: "invalid",
          command: "addexpense",
          reason: "Usage: /addexpense <amount> <name>",
        };
      }
      const amount = Number(parts[0]);
      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          type: "invalid",
          command: "addexpense",
          reason: "Amount must be a positive number.",
        };
      }
      const name = parts.slice(1).join(" ");
      return { type: "addexpense", amount, name };
    }

    default:
      return { type: "unknown", command: cmd };
  }
}
