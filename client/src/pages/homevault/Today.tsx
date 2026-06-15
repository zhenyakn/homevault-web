import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Stats = NonNullable<RouterOutputs["dashboard"]["stats"]>;
type OverdueExpense = Stats["overdueExpenses"][number];
type StaleRepair = Stats["staleRepairs"][number];
type DecisionUpgrade = Stats["upgradesNeedingDecision"][number];
type ActiveUpgrade = Stats["activeUpgrades"][number];
type CalEvent = RouterOutputs["calendar"]["list"][number];

import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  Receipt,
  Settings,
  Wrench,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { format, isToday, isTomorrow } from "date-fns";
import {
  HVCard,
  MetricCard,
  ActionItem,
  UpcomingEventItem,
  HVPageHeader,
  type ActionTone,
} from "@/components/homevault";
import { useAuth } from "@/_core/hooks/useAuth";

// ── Category colours for the spend breakdown ───────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Mortgage: "#214E3D",
  Utility: "#D6A85D",
  Insurance: "#3B6EA8",
  Tax: "#B84E4E",
  Maintenance: "#C47B38",
  Other: "#9ca3af",
};

function relDate(d: string, t: (k: string) => string) {
  const dt = new Date(d);
  if (isToday(dt)) return t("dashboard.today");
  if (isTomorrow(dt)) return t("dashboard.tomorrow");
  return format(dt, "MMM d");
}

// Whole days a due date is past, relative to local midnight today (never < 0).
// For a recurring expense the stored date is the original occurrence, which may
// be years old; advance it by its interval to the most recent occurrence on or
// before today so the count reflects the *current* cycle, not the first one.
function daysOverdue(d: string, interval?: string | null): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${d}T00:00:00`);
  if (interval) {
    const step = (date: Date) => {
      if (interval === "yearly") date.setFullYear(date.getFullYear() + 1);
      else if (interval === "quarterly") date.setMonth(date.getMonth() + 3);
      else date.setMonth(date.getMonth() + 1); // monthly (default)
    };
    for (;;) {
      const next = new Date(due);
      step(next);
      if (next > today) break;
      due.setTime(next.getTime());
    }
  }
  return Math.max(
    0,
    Math.round((today.getTime() - due.getTime()) / 86_400_000)
  );
}

// ── Things to handle ───────────────────────────────────────────────────────────

type HandleItem = {
  key: string;
  title: string;
  description?: string;
  amount?: string;
  status?: string;
  tone: ActionTone;
  icon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
};

function ThingsToHandle({
  overdue,
  stale,
  decisionNeeded,
  cur,
  onMarkPaid,
}: {
  overdue: OverdueExpense[];
  stale: StaleRepair[];
  decisionNeeded: DecisionUpgrade[];
  cur: string;
  onMarkPaid: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();

  const items: HandleItem[] = [
    ...overdue.map(e => {
      const days = daysOverdue(e.date, e.recurringInterval);
      return {
        key: `exp-${e.id}`,
        title: `${e.label} ${t("dashboard.unpaidSuffix")}`,
        description: `${t("dashboard.due")} ${relDate(e.date, t)}`,
        amount: formatCurrency(e.amount, cur),
        status:
          days === 0
            ? t("dashboard.overdue")
            : t("dashboard.daysOverdue", { count: days }),
        tone: "danger" as ActionTone,
        icon: <Receipt className="h-4 w-4" />,
        actionLabel: t("homevault.pay"),
        onAction: () => onMarkPaid(e.id),
      };
    }),
    ...stale.map(r => ({
      key: `rep-${r.id}`,
      title: r.label,
      description: r.contractor
        ? `${t(`priority.${r.priority}`, { defaultValue: r.priority ?? "" })} · ${r.contractor}`
        : t(`priority.${r.priority}`, { defaultValue: r.priority ?? "" }),
      status: t("dashboard.stale5d"),
      tone: "warning" as ActionTone,
      icon: <Wrench className="h-4 w-4" />,
      actionLabel: t("homevault.review"),
      onAction: () => nav("/repairs"),
    })),
    ...decisionNeeded.map(u => ({
      key: `upg-${u.id}`,
      title: u.label,
      description: t("dashboard.quotesReceived"),
      tone: "info" as ActionTone,
      icon: <FileText className="h-4 w-4" />,
      actionLabel: t("homevault.review"),
      onAction: () => nav(`/upgrades/${u.id}`),
    })),
  ];

  return (
    <HVCard
      eyebrow={t("homevault.thingsToHandle")}
      title={
        items.length > 0
          ? t("homevault.thingsToHandleSub", { count: items.length })
          : undefined
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center md:py-10">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-hv-primary-soft">
            <CheckCircle2 className="h-5 w-5 text-hv-primary" />
          </span>
          <p className="text-[14px] font-semibold text-hv-ink">
            {t("homevault.allGood")}
          </p>
          <p className="max-w-xs text-[12.5px] text-hv-muted">
            {t("homevault.allGoodSub")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <ActionItem
              key={item.key}
              title={item.title}
              description={item.description}
              amount={item.amount}
              status={item.status}
              tone={item.tone}
              icon={item.icon}
              actionLabel={item.actionLabel}
              onAction={item.onAction}
            />
          ))}
        </div>
      )}
    </HVCard>
  );
}

// ── Upcoming ───────────────────────────────────────────────────────────────────

function UpcomingCard({ upcoming }: { upcoming: CalEvent[] }) {
  const { t } = useTranslation();
  const [, nav] = useLocation();

  return (
    <HVCard
      eyebrow={t("homevault.upcoming")}
      action={
        <button
          className="flex items-center gap-1 text-[12px] font-medium text-hv-primary hover:opacity-75"
          onClick={() => nav("/calendar")}
        >
          {t("dashboard.fullCalendar")}
        </button>
      }
    >
      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-5 text-center md:py-8">
          <CalendarDays className="h-6 w-6 text-hv-muted-soft" />
          <p className="text-[12.5px] text-hv-muted">
            {t("dashboard.nothingScheduled")}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {upcoming.map(e => (
            <UpcomingEventItem
              key={e.id}
              date={e.date}
              title={e.title}
              subtitle={e.category ?? undefined}
              onClick={() => nav("/calendar")}
            />
          ))}
        </div>
      )}
    </HVCard>
  );
}

// ── Monthly cost ───────────────────────────────────────────────────────────────

function SpendCard({
  spent,
  baseline,
  pct,
  remaining,
  cats,
  cur,
}: {
  spent: number;
  baseline: number;
  pct: number;
  remaining: number;
  cats: Record<string, number>;
  cur: string;
}) {
  const { t } = useTranslation();
  const fmt = (n: number) => formatCurrency(n, cur);
  const now = new Date();
  const top = Object.entries(cats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <HVCard
      eyebrow={`${t("dashboard.monthlySpend")} · ${format(now, "MMM yyyy")}`}
    >
      <div className="text-[28px] font-bold tracking-tight tabular-nums text-hv-ink">
        {fmt(spent)}
      </div>
      {spent === 0 ? (
        <p className="mt-1 text-[12.5px] text-hv-muted">
          {t("dashboard.noExpensesThisMonth", { month: format(now, "MMMM") })}
        </p>
      ) : baseline > 0 ? (
        <>
          <p className="mt-1 mb-4 text-[12.5px] text-hv-muted">
            {t("expenses.of")} {fmt(baseline)}{" "}
            {t("dashboard.ofRecurringBaseline")}
            {remaining > 0 && (
              <>
                {" · "}
                <span className="font-medium text-hv-primary">
                  {fmt(remaining)} {t("dashboard.remaining")}
                </span>
              </>
            )}
          </p>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-hv-surface-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                pct >= 100
                  ? "bg-hv-red"
                  : pct >= 80
                    ? "bg-hv-orange"
                    : "bg-hv-primary"
              )}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="mt-1 mb-4 text-[12.5px] text-hv-muted">
          {t("dashboard.addRecurring")}
        </p>
      )}

      {top.length > 0 &&
        top.map(([cat, amount]) => (
          <div
            key={cat}
            className="flex items-center gap-2.5 border-t border-hv-border py-1.5"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CAT_COLOR[cat] ?? "#9ca3af" }}
            />
            <span className="flex-1 text-[12px] text-hv-muted">
              {t(`categories.${cat}`, { defaultValue: cat })}
            </span>
            <span className="w-16 text-right text-[12px] font-semibold tabular-nums text-hv-ink">
              {fmt(amount)}
            </span>
          </div>
        ))}
    </HVCard>
  );
}

// ── Active projects ────────────────────────────────────────────────────────────

function ProjectsCard({
  projects,
  cur,
}: {
  projects: ActiveUpgrade[];
  cur: string;
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const fmt = (n: number) => formatCurrency(n, cur);

  if (projects.length === 0) return null;

  return (
    <HVCard
      eyebrow={t("nav.projects")}
      action={
        <button
          className="flex items-center gap-1 text-[12px] font-medium text-hv-primary hover:opacity-75"
          onClick={() => nav("/upgrades")}
        >
          {t("homevault.viewAll")} <ArrowRight className="h-3 w-3" />
        </button>
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(u => (
          <button
            key={u.id}
            onClick={() => nav(`/upgrades/${u.id}`)}
            className="rounded-[var(--hv-radius-md)] border border-hv-border bg-hv-surface-muted p-2.5 text-start transition-colors hover:border-hv-primary/30 md:p-3.5"
          >
            <p className="truncate text-[13.5px] font-semibold text-hv-ink">
              {u.label}
            </p>
            <p className="mt-0.5 text-[12px] text-hv-muted">
              {fmt(u.spent)}{" "}
              <span className="text-hv-muted-soft">/ {fmt(u.budget)}</span>
            </p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-hv-border">
              <div
                className={cn(
                  "h-full rounded-full",
                  u.pct >= 100
                    ? "bg-hv-red"
                    : u.pct >= 80
                      ? "bg-hv-orange"
                      : "bg-hv-primary"
                )}
                style={{ width: `${Math.min(u.pct, 100)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </HVCard>
  );
}

// ── Today ──────────────────────────────────────────────────────────────────────

export default function Today() {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const utils = trpc.useUtils();

  const { data: stats, isLoading, error } = trpc.dashboard.stats.useQuery();
  const { data: calEvents = [] } = trpc.calendar.list.useQuery({});
  const { data: docSummary } = trpc.documents.summary.useQuery();

  const markPaid = trpc.expenses.markAsPaid.useMutation({
    onSuccess: () => utils.dashboard.stats.invalidate(),
  });

  const upcoming = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return calEvents
      .filter(e => {
        const d = new Date(e.date);
        return d >= now && d <= in7;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6);
  }, [calEvents]);

  const { user } = useAuth();

  const greeting = () => {
    const h = new Date().getHours();
    const base =
      h < 12
        ? t("dashboard.goodMorning")
        : h < 18
          ? t("dashboard.goodAfternoon")
          : t("dashboard.goodEvening");
    const firstName = user?.name?.trim().split(/\s+/)[0];
    return firstName ? `${base}, ${firstName}` : base;
  };

  if (isLoading)
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
      </div>
    );

  if (error || !stats)
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-8 w-8 text-hv-muted-soft" />
        <div>
          <p className="text-sm font-medium">
            {t("dashboard.loadError", "Couldn't load dashboard")}
          </p>
          <p className="mt-1 text-xs text-hv-muted">
            {error?.message ??
              t(
                "dashboard.loadErrorHint",
                "Your data may still be loading or no property is set up yet."
              )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/settings")}>
          <Settings className="me-1.5 h-3.5 w-3.5" />
          {t("nav.settings")}
        </Button>
      </div>
    );

  const s = stats;
  const cur = s.currency ?? "ILS";
  const fmt = (n: number) => formatCurrency(n, cur);

  const openRepairs = s.openRepairs ?? [];
  const highPriority = openRepairs.filter(
    r => r.priority === "high" || r.priority === "urgent"
  ).length;

  const homeFilePct = docSummary?.percentage ?? 0;

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <HVPageHeader
        title={greeting()}
        subtitle={
          <>
            {s.propertyName && (
              <>
                <span className="text-hv-ink/70">{s.propertyName}</span>
                {" · "}
              </>
            )}
            {format(new Date(), "EEEE, MMMM d")}
          </>
        }
      />

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4 md:gap-3.5">
        <MetricCard
          label={t("homevault.monthlySpend")}
          value={fmt(s.monthSpent)}
          tone="neutral"
          helper={
            s.monthRemaining > 0
              ? t("homevault.leftVsBaseline", { amount: fmt(s.monthRemaining) })
              : undefined
          }
          onClick={() => nav("/expenses")}
        />
        <MetricCard
          label={t("homevault.upcoming")}
          value={upcoming.length}
          tone="blue"
          helper={t("homevault.paymentsThisWeek")}
          onClick={() => nav("/calendar")}
        />
        <MetricCard
          label={t("homevault.openRepairs")}
          value={openRepairs.length}
          tone={highPriority > 0 ? "orange" : "neutral"}
          helper={
            highPriority > 0
              ? t("homevault.highPriorityCount", { count: highPriority })
              : undefined
          }
          onClick={() => nav("/repairs")}
        />
        <MetricCard
          label={t("homevault.documents")}
          value={`${homeFilePct}%`}
          tone="green"
          helper={t("homevault.homeFileShort")}
          onClick={() => nav("/documents")}
        />
      </div>

      {/* Things to handle + Upcoming */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 md:gap-[18px]">
        <div className="lg:col-span-2">
          <ThingsToHandle
            overdue={s.overdueExpenses ?? []}
            stale={s.staleRepairs ?? []}
            decisionNeeded={s.upgradesNeedingDecision ?? []}
            cur={cur}
            onMarkPaid={id =>
              markPaid.mutate({
                id,
                paidDate: new Date().toISOString().split("T")[0],
              })
            }
          />
        </div>
        <div>
          <UpcomingCard upcoming={upcoming} />
        </div>
      </div>

      {/* Monthly cost + projects */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3 md:mt-[18px] md:gap-[18px]">
        <div className="lg:col-span-1">
          <SpendCard
            spent={s.monthSpent}
            baseline={s.monthlyRecurring}
            pct={s.monthPct}
            remaining={s.monthRemaining}
            cats={s.monthCats}
            cur={cur}
          />
        </div>
        <div className="lg:col-span-2">
          <ProjectsCard projects={s.activeUpgrades ?? []} cur={cur} />
        </div>
      </div>
    </div>
  );
}
