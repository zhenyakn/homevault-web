/**
 * NotificationCenter — Phase 1 UX/UI preview.
 *
 * Header bell with an unread badge and a popover feed, backed by the in-memory
 * mock store (useMockNotifications). No backend: clicking an item routes via
 * wouter and marks it read; "Mark all read" clears the badge. In Phase 2 the
 * store is replaced by the `notification.listInApp` / `markRead` tRPC calls.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Wallet,
  Landmark,
  Wrench,
  ShieldCheck,
  CalendarDays,
  Info,
  Check,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type {
  MockNotification,
  NotificationCategory,
} from "@/lib/mockNotifications";
import {
  clearAll,
  markAllRead,
  markRead,
  useMockNotifications,
} from "@/hooks/useMockNotifications";

const CATEGORY_ICON: Record<
  NotificationCategory,
  React.ComponentType<{ className?: string }>
> = {
  expense: Wallet,
  loan: Landmark,
  repair: Wrench,
  warranty: ShieldCheck,
  calendar: CalendarDays,
  system: Info,
};

/** Per-category accent for the item icon (text + subtle background). */
const CATEGORY_COLOR: Record<NotificationCategory, string> = {
  expense: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  loan: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  repair: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  warranty: "text-sky-600 bg-sky-500/10 border-sky-500/20",
  calendar: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  system: "text-muted-foreground bg-muted/40 border-border",
};

/** Minutes in a day — boundary between the "Today" and "Earlier" groups. */
const DAY_MINUTES = 60 * 24;

function relativeTime(minutesAgo: number, t: (k: string, o?: any) => string) {
  if (minutesAgo < 1) return t("notifs.justNow");
  if (minutesAgo < 60) return t("notifs.minutesAgo", { count: minutesAgo });
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return t("notifs.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("notifs.daysAgo", { count: days });
}

export function NotificationCenter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { notifications } = useMockNotifications();
  const unread = notifications.filter(n => !n.read).length;

  const handleOpen = (id: string, url?: string) => {
    markRead(id);
    if (url) {
      setOpen(false);
      setLocation(url);
    }
  };

  const today = notifications.filter(n => n.minutesAgo < DAY_MINUTES);
  const earlier = notifications.filter(n => n.minutesAgo >= DAY_MINUTES);

  const renderItem = (n: MockNotification) => {
    const Icon = CATEGORY_ICON[n.category];
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => handleOpen(n.id, n.url)}
          className={cn(
            "flex w-full items-start gap-3 px-3 py-3 text-start transition-colors hover:bg-muted/50",
            !n.read && "bg-primary/[0.03]"
          )}
        >
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              CATEGORY_COLOR[n.category]
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "truncate text-sm",
                  n.read ? "font-medium" : "font-semibold"
                )}
              >
                {n.title}
              </p>
              {!n.read && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground leading-snug">
              {n.body}
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {relativeTime(n.minutesAgo, t)}
            </p>
          </div>
        </button>
      </li>
    );
  };

  const renderGroup = (label: string, items: MockNotification[]) =>
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
          {notifications.length > 0 && (
            <div className="flex items-center gap-0.5">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => markAllRead()}
                >
                  <Check className="me-1 h-3 w-3" />
                  {t("notifs.markAllRead")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => clearAll()}
              >
                <Trash2 className="me-1 h-3 w-3" />
                {t("notifs.clearAll")}
              </Button>
            </div>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">{t("notifs.empty")}</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto overscroll-contain">
            <ul>
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
