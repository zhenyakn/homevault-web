/**
 * NotificationCenter — header bell + popover feed, backed by the real
 * `notification.listInApp` tRPC feed (channel='inapp' delivery-log rows).
 * Clicking an item routes via wouter and marks it read; "Mark all read" clears
 * the badge.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Bell,
  Wallet,
  Landmark,
  Wrench,
  ShieldCheck,
  CalendarDays,
  Info,
  Check,
  AlertCircle,
  X,
  Trash2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useHomeVaultUI } from "@/contexts/HomeVaultUIContext";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Category =
  | "expense"
  | "loan"
  | "repair"
  | "warranty"
  | "calendar"
  | "system";

type FeedItem = {
  id: number;
  category: Category;
  title: string;
  body: string;
  url: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

const CATEGORY_ICON: Record<
  Category,
  React.ComponentType<{ className?: string }>
> = {
  expense: Wallet,
  loan: Landmark,
  repair: Wrench,
  warranty: ShieldCheck,
  calendar: CalendarDays,
  system: Info,
};

const CATEGORY_COLOR: Record<Category, string> = {
  expense: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  loan: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  repair: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  warranty: "text-sky-600 bg-sky-500/10 border-sky-500/20",
  calendar: "text-rose-700 bg-rose-500/10 border-rose-500/20",
  system: "text-muted-foreground bg-muted/40 border-border",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_DISMISS_KEY = "hv:attention-dismissed";

// How long the undo toast stays up before a delete/dismiss is committed.
const UNDO_MS = 5000;
// Horizontal distance (px) a touch must travel to commit a swipe delete.
const SWIPE_THRESHOLD = 72;
// Movement below this (px) is treated as a tap, not the start of a gesture.
const GESTURE_SLOP = 8;
// Where the row animates to when a swipe commits (past the popover's width).
const SWIPE_EXIT = 360;

type RowTone = "danger" | "primary";

/**
 * A single hover-revealed action (mark-read / delete / dismiss). Reads as a
 * calm icon button that warms into the tone's soft colour on hover — soft
 * pill in the HomeVault theme, rounded square in the classic one.
 */
function RowAction({
  hv,
  tone,
  label,
  icon,
  onClick,
}: {
  hv: boolean;
  tone: RowTone;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? hv
        ? "hover:bg-hv-danger-bg hover:text-hv-red"
        : "hover:bg-destructive/10 hover:text-destructive"
      : hv
        ? "hover:bg-hv-primary-soft hover:text-hv-primary"
        : "hover:bg-primary/10 hover:text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors",
        hv ? "rounded-full" : "rounded-lg",
        toneClass
      )}
    >
      {icon}
    </button>
  );
}

/**
 * Row wrapper that layers two delete affordances over arbitrary content:
 *  - hover-capable pointers: a floating action pill slides in on hover;
 *  - touch: swipe toward the inline-start edge to delete, revealing a soft
 *    danger zone with a circular icon that grows as you cross the threshold.
 * `onDelete` fires once the gesture commits; the caller owns the undo flow.
 * Visuals follow the active design system via `hv`.
 */
function SwipeRow({
  hv,
  onDelete,
  actions,
  children,
  isRTL,
  tintClass,
}: {
  hv: boolean;
  onDelete: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  isRTL: boolean;
  /** The row's own background tint, so the revealed gap matches the entry. */
  tintClass?: string;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"h" | "v" | null>(null);

  // Delete toward the inline-start edge: leftwards in LTR, rightwards in RTL.
  const deleteSign = isRTL ? 1 : -1;
  const distance = Math.abs(dragX);
  const progress = Math.min(1, distance / SWIPE_THRESHOLD);
  const armed = distance >= SWIPE_THRESHOLD;

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    axis.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;
    if (axis.current == null) {
      if (Math.abs(dx) < GESTURE_SLOP && Math.abs(dy) < GESTURE_SLOP) return;
      // Lock the gesture to one axis so vertical scrolls aren't hijacked.
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (axis.current === "h") setDragging(true);
    }
    if (axis.current !== "h") return;
    // Follow the finger toward the delete edge; clamp the other way, and add
    // a little rubber-band resistance once past the commit threshold.
    let travel = deleteSign < 0 ? Math.min(0, dx) : Math.max(0, dx);
    if (Math.abs(travel) > SWIPE_THRESHOLD) {
      const over = Math.abs(travel) - SWIPE_THRESHOLD;
      travel = deleteSign * (SWIPE_THRESHOLD + over * 0.4);
    }
    setDragX(travel);
  };

  const onTouchEnd = () => {
    const committed = axis.current === "h" && armed;
    start.current = null;
    axis.current = null;
    setDragging(false);
    if (committed) {
      // Slide the row off-screen, then commit once the animation lands.
      setDragX(deleteSign * SWIPE_EXIT);
      window.setTimeout(onDelete, 180);
    } else {
      setDragX(0);
    }
  };

  return (
    <li className="group relative overflow-hidden">
      {/* Swipe-to-delete zone, revealed as the content slides away. It mirrors
          the entry's own surface (--card === --popover) plus the row's tint, so
          the gap reads as the same row. The circular chip stays centred in the
          revealed strip — emerging from under the content and tracking the
          finger — and is the only thing carrying the danger colour. */}
      <div className="pointer-events-none absolute inset-0 bg-popover">
        {tintClass && <div className={cn("absolute inset-0", tintClass)} />}
        <div
          className="absolute inset-y-0 end-0 flex items-center justify-center"
          style={{ width: distance }}
        >
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md transition-[box-shadow]",
              hv ? "bg-hv-red" : "bg-destructive",
              armed &&
                (hv ? "ring-4 ring-hv-red/20" : "ring-4 ring-destructive/20")
            )}
            style={{
              transform: `scale(${Math.min(1, 0.4 + progress * 0.7)})`,
              opacity: Math.min(1, progress * 1.3),
            }}
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </span>
        </div>
      </div>

      <div
        className="relative flex items-stretch bg-card"
        style={{
          transform: `translateX(${dragX}px)`,
          touchAction: "pan-y",
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
        {/* Floating action pill — hover-capable pointers only. */}
        {actions && (
          <div className="pointer-events-none absolute inset-y-0 end-1.5 hidden items-center [@media(hover:hover)]:flex">
            <div
              className={cn(
                "flex scale-95 items-center gap-0.5 p-0.5 opacity-0 shadow-md ring-1 ring-border/60 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-hover:pointer-events-auto",
                hv ? "rounded-full bg-hv-surface" : "rounded-xl bg-popover"
              )}
            >
              {actions}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function minutesSince(d: Date | string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
}

function relativeTime(d: Date | string, t: (k: string, o?: any) => string) {
  const m = minutesSince(d);
  if (m < 1) return t("notifs.justNow");
  if (m < 60) return t("notifs.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("notifs.hoursAgo", { count: h });
  return t("notifs.daysAgo", { count: Math.floor(h / 24) });
}

export function NotificationCenter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const { enabled: hv } = useHomeVaultUI();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data } = trpc.notification.listInApp.useQuery(undefined, {
    // Light polling so reminders/test-sends surface without a manual refresh.
    refetchInterval: 60_000,
  });
  const notifications = (data ?? []) as FeedItem[];

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.listInApp.invalidate(),
  });
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => utils.notification.listInApp.invalidate(),
  });
  const deleteInApp = trpc.notification.deleteInApp.useMutation({
    // Keep the row hidden until the refetch settles so it can't flash back.
    onSuccess: async (_data, vars) => {
      await utils.notification.listInApp.invalidate();
      setHiddenIds(prev => {
        const next = new Set(prev);
        next.delete(vars.id);
        return next;
      });
    },
  });

  // Deferred-delete with undo: a deleted item is hidden immediately and the
  // server delete is fired only after the undo window lapses. Undo cancels the
  // pending commit and restores the row — no server round-trip either way.
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = deleteTimers.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const requestDelete = (item: FeedItem) => {
    setHiddenIds(prev => new Set(prev).add(item.id));
    const timer = setTimeout(() => {
      deleteTimers.current.delete(item.id);
      deleteInApp.mutate({ id: item.id });
    }, UNDO_MS);
    deleteTimers.current.set(item.id, timer);
    toast(t("notifs.deleted"), {
      duration: UNDO_MS,
      action: {
        label: t("notifs.undo"),
        onClick: () => {
          const pending = deleteTimers.current.get(item.id);
          if (pending) {
            clearTimeout(pending);
            deleteTimers.current.delete(item.id);
          }
          setHiddenIds(prev => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        },
      },
    });
  };

  // Live "needs attention" items from the dashboard, surfaced here so the bell
  // can't say "all caught up" while the dashboard shows overdue bills / stale
  // repairs. These are derived (not delivery-log rows): they persist while the
  // condition holds and route to the relevant page on click.
  const { data: stats } = trpc.dashboard.attention.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const attention = useMemo(() => {
    const items: {
      key: string;
      category: Category;
      title: string;
      body: string;
      url: string;
    }[] = [];
    for (const e of stats?.overdueExpenses ?? []) {
      items.push({
        key: `att-exp-${e.id}`,
        category: "expense",
        title: t("notifs.overdueExpense"),
        body: `${e.label} · ${formatCurrency(e.amount)}`,
        url: "/expenses",
      });
    }
    for (const r of stats?.staleRepairs ?? []) {
      items.push({
        key: `att-rep-${r.id}`,
        category: "repair",
        title: t("notifs.staleRepair"),
        body: r.label,
        url: "/repairs",
      });
    }
    return items;
  }, [stats, t]);

  // Locally-dismissed attention items. Persisted so a dismissed item stays
  // cleared across reloads; pruned to current items so a resolved-then-recurring
  // condition re-surfaces (and the set can't grow unbounded).
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(
        JSON.parse(localStorage.getItem(ATTENTION_DISMISS_KEY) || "[]")
      );
    } catch {
      return new Set();
    }
  });
  const persistDismissed = (next: Set<string>) => {
    try {
      localStorage.setItem(
        ATTENTION_DISMISS_KEY,
        JSON.stringify(Array.from(next))
      );
    } catch {
      // ignore storage failures (private mode / quota)
    }
  };
  useEffect(() => {
    const keys = new Set(attention.map(a => a.key));
    setDismissed(prev => {
      const next = new Set(Array.from(prev).filter(k => keys.has(k)));
      if (next.size === prev.size) return prev;
      persistDismissed(next);
      return next;
    });
  }, [attention]);

  const dismissAttention = (key: string) => {
    setDismissed(prev => {
      const next = new Set(prev).add(key);
      persistDismissed(next);
      return next;
    });
  };

  const undismissAttention = (key: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(key);
      persistDismissed(next);
      return next;
    });
  };

  const requestDismiss = (key: string) => {
    dismissAttention(key);
    toast(t("notifs.dismissed"), {
      duration: UNDO_MS,
      action: {
        label: t("notifs.undo"),
        onClick: () => undismissAttention(key),
      },
    });
  };

  const visibleAttention = attention.filter(a => !dismissed.has(a.key));

  // Items pending a deferred delete are hidden from the feed (and badge count).
  const visibleNotifications = notifications.filter(n => !hiddenIds.has(n.id));

  const unread =
    visibleNotifications.filter(n => !n.readAt).length +
    visibleAttention.length;

  const handleOpen = (item: FeedItem) => {
    if (!item.readAt) markRead.mutate({ id: item.id });
    if (item.url) {
      setOpen(false);
      setLocation(item.url);
    }
  };

  const today = visibleNotifications.filter(
    n => Date.now() - new Date(n.createdAt).getTime() < DAY_MS
  );
  const earlier = visibleNotifications.filter(
    n => Date.now() - new Date(n.createdAt).getTime() >= DAY_MS
  );

  const renderItem = (n: FeedItem) => {
    const Icon = CATEGORY_ICON[n.category] ?? Info;
    return (
      <SwipeRow
        key={n.id}
        hv={hv}
        isRTL={isRTL}
        onDelete={() => requestDelete(n)}
        tintClass={n.readAt ? undefined : "bg-primary/[0.03]"}
        actions={
          <>
            {!n.readAt && (
              <RowAction
                hv={hv}
                tone="primary"
                label={t("notifs.markRead")}
                icon={<Check className="h-4 w-4" />}
                onClick={() => markRead.mutate({ id: n.id })}
              />
            )}
            <RowAction
              hv={hv}
              tone="danger"
              label={t("notifs.delete")}
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => requestDelete(n)}
            />
          </>
        }
      >
        <button
          type="button"
          onClick={() => handleOpen(n)}
          className={cn(
            "flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-start transition-colors [@media(hover:hover)]:group-hover:bg-muted/40",
            !n.readAt && "bg-primary/[0.03]"
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              CATEGORY_COLOR[n.category] ?? CATEGORY_COLOR.system
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "truncate text-sm",
                  n.readAt ? "font-medium" : "font-semibold"
                )}
              >
                {n.title}
              </p>
              {!n.readAt && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground leading-snug">
              {n.body}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {relativeTime(n.createdAt, t)}
            </p>
          </div>
        </button>
      </SwipeRow>
    );
  };

  const handleAttentionOpen = (url: string) => {
    setOpen(false);
    setLocation(url);
  };

  const renderAttention = () =>
    visibleAttention.length === 0 ? null : (
      <li>
        <p className="bg-rose-500/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-400">
          {t("notifs.needsAttention")}
        </p>
        <ul className="divide-y divide-border">
          {visibleAttention.map(a => {
            const Icon = CATEGORY_ICON[a.category] ?? AlertCircle;
            return (
              <SwipeRow
                key={a.key}
                hv={hv}
                isRTL={isRTL}
                onDelete={() => requestDismiss(a.key)}
                tintClass="bg-rose-500/[0.03]"
                actions={
                  <RowAction
                    hv={hv}
                    tone="danger"
                    label={t("notifs.dismiss")}
                    icon={<X className="h-4 w-4" />}
                    onClick={() => requestDismiss(a.key)}
                  />
                }
              >
                <button
                  type="button"
                  onClick={() => handleAttentionOpen(a.url)}
                  className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-start bg-rose-500/[0.03] transition-colors [@media(hover:hover)]:group-hover:bg-muted/40"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                      "text-rose-700 bg-rose-500/10 border-rose-500/20"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground leading-snug">
                      {a.body}
                    </p>
                  </div>
                </button>
              </SwipeRow>
            );
          })}
        </ul>
      </li>
    );

  const renderGroup = (label: string, items: FeedItem[]) =>
    items.length === 0 ? null : (
      <li>
        <p className="bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <ul className="divide-y divide-border">{items.map(renderItem)}</ul>
      </li>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("notifs.title")}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            className
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{t("notifs.title")}</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                markAllRead.mutate();
                if (visibleAttention.length > 0) {
                  const next = new Set(dismissed);
                  for (const a of visibleAttention) next.add(a.key);
                  setDismissed(next);
                  persistDismissed(next);
                }
              }}
            >
              <Check className="me-1 h-3 w-3" />
              {t("notifs.markAllRead")}
            </Button>
          )}
        </div>

        {visibleNotifications.length === 0 && visibleAttention.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">{t("notifs.empty")}</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto overscroll-contain">
            <ul>
              {renderAttention()}
              {renderGroup(t("notifs.today"), today)}
              {renderGroup(t("notifs.earlier"), earlier)}
            </ul>
          </div>
        )}

        <div className="border-t px-3 py-2 text-center">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setLocation("/settings/notifications");
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("notifs.manageSettings")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationCenter;
