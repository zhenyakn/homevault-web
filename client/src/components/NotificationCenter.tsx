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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { NotificationCategory } from "@/lib/mockNotifications";
import {
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
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{t("notifs.title")}</p>
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
        </div>

        {notifications.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            {t("notifs.empty")}
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y divide-border">
              {notifications.map(n => {
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
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
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
              })}
            </ul>
          </ScrollArea>
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
