/**
 * NotificationCenter — header bell + popover feed, backed by the real
 * `notification.listInApp` tRPC feed (channel='inapp' delivery-log rows).
 * Clicking an item routes via wouter and marks it read; "Mark all read" clears
 * the badge.
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
  calendar: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  system: "text-muted-foreground bg-muted/40 border-border",
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const unread = notifications.filter(n => !n.readAt).length;

  const handleOpen = (item: FeedItem) => {
    if (!item.readAt) markRead.mutate({ id: item.id });
    if (item.url) {
      setOpen(false);
      setLocation(item.url);
    }
  };

  const today = notifications.filter(
    n => Date.now() - new Date(n.createdAt).getTime() < DAY_MS
  );
  const earlier = notifications.filter(
    n => Date.now() - new Date(n.createdAt).getTime() >= DAY_MS
  );

  const renderItem = (n: FeedItem) => {
    const Icon = CATEGORY_ICON[n.category] ?? Info;
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => handleOpen(n)}
          className={cn(
            "flex w-full items-start gap-3 px-3 py-3 text-start transition-colors hover:bg-muted/50",
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
            <p className="text-[11px] text-muted-foreground/70">
              {relativeTime(n.createdAt, t)}
            </p>
          </div>
        </button>
      </li>
    );
  };

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
              onClick={() => markAllRead.mutate()}
            >
              <Check className="me-1 h-3 w-3" />
              {t("notifs.markAllRead")}
            </Button>
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
