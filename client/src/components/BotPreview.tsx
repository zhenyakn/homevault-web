/**
 * BotPreview — Phase 1 UX/UI preview of the two-way chat bot.
 *
 * Replays a scripted transcript (mockBotTranscript) as chat bubbles, including
 * an inline Confirm / Cancel control on the `/addexpense` write step, so the
 * user can feel how the Telegram bot would behave. Pure presentation: "sending"
 * a free-text message just appends a canned bot reply. No network, no backend.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Bot, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  mockBotCommandReplies,
  mockBotCommands,
  mockBotReplies,
  mockBotTranscript,
  type BotTurn,
} from "@/lib/mockNotifications";

type Bubble = BotTurn & { id: string; pending?: boolean };

export function BotPreview() {
  const { t } = useTranslation();
  // Seed every turn EXCEPT the trailing success message — that only appears
  // once the user confirms the scripted `/addexpense` write.
  const { seed, successText } = useMemo(() => {
    const turns = mockBotTranscript.map((turn, i) => ({
      ...turn,
      id: `seed-${i}`,
    }));
    const last = turns[turns.length - 1];
    return { seed: turns.slice(0, -1), successText: last.text };
  }, []);
  const [bubbles, setBubbles] = useState<Bubble[]>(seed);
  const [draft, setDraft] = useState("");
  const [replyIdx, setReplyIdx] = useState(0);
  // Whether the scripted confirm step is still awaiting a decision.
  const [pendingConfirm, setPendingConfirm] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message (and the confirm buttons) in view within the
  // bounded chat, without scrolling the surrounding page.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, pendingConfirm]);

  const send = (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!text) return;
    // Known slash-commands get their canned reply; everything else cycles
    // through the generic replies.
    const reply =
      mockBotCommandReplies[text] ??
      mockBotReplies[replyIdx % mockBotReplies.length];
    if (!mockBotCommandReplies[text]) setReplyIdx(i => i + 1);
    const stamp = Date.now();
    setBubbles(b => [
      ...b,
      { id: `u-${stamp}`, from: "user", text },
      { id: `b-${stamp}`, from: "bot", text: reply },
    ]);
    setDraft("");
  };

  const resolveConfirm = (ok: boolean) => {
    setPendingConfirm(false);
    setBubbles(b => [
      ...b,
      {
        id: `b-confirm-${Date.now()}`,
        from: "bot",
        text: ok ? successText : t("notifs.bot.cancelled"),
      },
    ]);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium">{t("notifs.bot.previewTitle")}</p>
        <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {t("notifs.bot.previewBadge")}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-64 space-y-2 overflow-y-auto overscroll-contain bg-background px-3 py-3"
      >
        {bubbles.map(b => {
          const showConfirm = b.confirm && pendingConfirm;
          return (
            <div
              key={b.id}
              className={cn(
                "flex",
                b.from === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-line break-words rounded-2xl px-3 py-1.5 text-xs leading-relaxed",
                  b.from === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground"
                )}
              >
                {b.text}
                {showConfirm && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => resolveConfirm(true)}
                    >
                      <Check className="me-1 h-3 w-3" />
                      {t("notifs.bot.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => resolveConfirm(false)}
                    >
                      <X className="me-1 h-3 w-3" />
                      {t("notifs.bot.cancel")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t bg-muted/20 px-2 py-2">
        {mockBotCommands.map(cmd => (
          <button
            key={cmd}
            type="button"
            onClick={() => send(cmd)}
            className="rounded-full border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {cmd}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t px-2 py-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") send();
          }}
          placeholder={t("notifs.bot.inputPlaceholder")}
          className="h-8 text-xs"
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => send()}
          aria-label={t("notifs.bot.send")}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="border-t bg-muted/20 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
        {t("notifs.bot.previewDisclaimer")}
      </p>
    </div>
  );
}

export default BotPreview;
