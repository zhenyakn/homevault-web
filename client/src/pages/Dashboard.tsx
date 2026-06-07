import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Stats = NonNullable<RouterOutputs["dashboard"]["stats"]>;
type OverdueExpense = Stats["overdueExpenses"][number];
type StaleRepair = Stats["staleRepairs"][number];
type DecisionUpgrade = Stats["upgradesNeedingDecision"][number];
type ActiveUpgrade = Stats["activeUpgrades"][number];
type LoanSummaryItem = Stats["loanSummary"][number];
type OpenRepair = Stats["openRepairs"][number];
type CalEvent = RouterOutputs["calendar"]["list"][number];

import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Settings,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  idea: "bg-slate-400",
  planning: "bg-violet-400",
  in_progress: "bg-orange-400",
  completed: "bg-emerald-400",
  cancelled: "bg-rose-400",
};

const CAT_COLOR: Record<string, string> = {
  Mortgage: "#2B7A55",
  Utility: "#eab308",
  Insurance: "#a855f7",
  Tax: "#f43f5e",
  Maintenance: "#f97316",
  Other: "#9ca3af",
};

function barColor(pct: number) {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-400";
  return "bg-primary";
}

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
    // Walk forward while the next occurrence is still on/before today.
    for (;;) {
      const next = new Date(due);
      step(next);
      if (next > today) break;
      due.setTime(next.getTime());
    }
  }
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86_400_000));
}

// ── Card shell ────────────────────────────────────────────────────────────────

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-full border border-border rounded-xl bg-card p-4 shadow-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
      {children}
    </p>
  );
}

// ── OpenItemsCard ─────────────────────────────────────────────────────────────

function OpenItemsCard({
  openRepairs,
  overdueExpenses,
  activeUpgrades,
}: {
  openRepairs: OpenRepair[];
  overdueExpenses: OverdueExpense[];
  activeUpgrades: ActiveUpgrade[];
}) {
  const { t } = useTranslation();

  const urgent = openRepairs.filter(r => r.priority === "urgent").length;
  const high = openRepairs.filter(r => r.priority === "high").length;
  const overdue = overdueExpenses.length;
  const inProg = activeUpgrades.length;

  const rows = [
    {
      label: t("dashboard.urgentRepairs"),
      count: urgent,
      color: urgent > 0 ? "text-rose-500" : "text-muted-foreground",
      dot: "bg-rose-500",
    },
    {
      label: t("dashboard.highPriority"),
      count: high,
      color: high > 0 ? "text-orange-500" : "text-muted-foreground",
      dot: "bg-orange-500",
    },
    {
      label: t("dashboard.activeUpgrades"),
      count: inProg,
      color: inProg > 0 ? "text-foreground" : "text-muted-foreground",
      dot: "bg-amber-400",
    },
    {
      label: t("dashboard.overdueBills"),
      count: overdue,
      color: overdue > 0 ? "text-rose-500" : "text-muted-foreground",
      dot: "bg-rose-500",
    },
  ];

  return (
    <Card>
      <CardLabel>{t("dashboard.openItems")}</CardLabel>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between py-2",
              i < rows.length - 1 && "border-b border-border"
            )}
          >
            <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span
                className={cn("w-1.5 h-1.5 rounded-full shrink-0", row.dot)}
              />
              {row.label}
            </span>
            <span
              className={cn("text-[15px] font-bold tabular-nums", row.color)}
            >
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── SpendCard ─────────────────────────────────────────────────────────────────

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
  const daysLeft =
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() -
    now.getDate();
  const top = Object.entries(cats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <CardLabel>
          {t("dashboard.monthlySpend")} · {format(now, "MMM yyyy")}
        </CardLabel>
        <p className="text-xs text-muted-foreground -mt-3">
          {daysLeft} {t("dashboard.daysLeft")}
        </p>
      </div>

      <div className="text-3xl font-bold tracking-tight tabular-nums">
        {fmt(spent)}
      </div>
      {spent === 0 ? (
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          {t("dashboard.noExpensesThisMonth", { month: format(now, "MMMM") })}
        </p>
      ) : baseline > 0 ? (
        <>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {t("expenses.of")} {fmt(baseline)}{" "}
            {t("dashboard.ofRecurringBaseline")}
            {remaining > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-primary font-medium">
                  {fmt(remaining)} {t("dashboard.remaining")}
                </span>
              </>
            )}
          </p>
          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden mb-1.5">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                barColor(pct)
              )}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground text-right mb-4">
            {pct}
            {t("dashboard.ofBaseline")}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          {t("dashboard.addRecurring")}
        </p>
      )}

      {top.length > 0 &&
        top.map(([cat, amount]) => (
          <div
            key={cat}
            className="flex items-center gap-2.5 py-1.5 border-t border-border"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: CAT_COLOR[cat] ?? "#9ca3af" }}
            />
            <span className="flex-1 text-xs text-muted-foreground">{cat}</span>
            <div className="w-14 h-[3px] bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((amount / spent) * 100)}%`,
                  background: CAT_COLOR[cat] ?? "#9ca3af",
                }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums w-16 text-right">
              {fmt(amount)}
            </span>
          </div>
        ))}
    </Card>
  );
}

// ── LoansCard ─────────────────────────────────────────────────────────────────

function LoansCard({ loans, cur }: { loans: LoanSummaryItem[]; cur: string }) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const fmt = (n: number) => formatCurrency(n, cur);

  const totalOutstanding = loans.reduce((s, l) => s + (l.remaining ?? 0), 0);

  return (
    <Card>
      <CardLabel>{t("loans.title")}</CardLabel>
      <div className="text-2xl font-bold tracking-tight tabular-nums mb-1">
        {fmt(totalOutstanding)}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("dashboard.totalOutstanding")}
      </p>

      {loans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("dashboard.noActiveLoans")}
        </p>
      ) : (
        <>
          <div className="h-px bg-border mb-3" />
          <div className="space-y-3">
            {loans.map(l => {
              const repaid = l.repaid ?? 0;
              const remaining =
                l.remaining ?? Math.max(0, (l.totalAmount ?? 0) - repaid);
              const pct = l.pct ?? 0;
              return (
                <div key={l.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12.5px] font-medium text-foreground truncate flex-1 mr-2">
                      {l.lender}
                    </span>
                    {l.paidOff ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {pct}% repaid
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    {fmt(remaining)} {t("dashboard.remaining")}
                    {l.interestRate ? ` · ${l.interestRate}%` : ""}
                    {l.endDate
                      ? ` · until ${format(new Date(l.endDate), "MMM yyyy")}`
                      : ""}
                  </p>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        l.paidOff ? "bg-emerald-500" : "bg-primary"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="flex items-center gap-1 text-xs text-primary hover:opacity-75 transition-opacity mt-4 font-medium"
            onClick={() => nav("/loans")}
          >
            {t("loans.title")} <ArrowRight className="h-3 w-3" />
          </button>
        </>
      )}
    </Card>
  );
}

// ── AttentionCard ─────────────────────────────────────────────────────────────

function AttentionCard({
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (k: string) =>
    setDismissed(p => new Set([...Array.from(p), k]));

  const visOverdue = overdue.filter(e => !dismissed.has(`exp-${e.id}`));
  const visStale = stale.filter(r => !dismissed.has(`rep-${r.id}`));
  const visDecision = decisionNeeded.filter(u => !dismissed.has(`upg-${u.id}`));
  const total = visOverdue.length + visStale.length + visDecision.length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <CardLabel>{t("dashboard.attention")}</CardLabel>
          {total > 0 && (
            <p className="text-[11.5px] text-muted-foreground -mt-2 mb-2">
              {total} {t("dashboard.itemsNeedAction")}
            </p>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("dashboard.noAttention")}
        </div>
      ) : (
        <div className="space-y-2">
          {visOverdue.map(e => {
            const days = daysOverdue(e.date, e.recurringInterval);
            const severe = days >= 30;
            return (
            <div
              key={e.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/50"
            >
              <div className="w-7 h-7 rounded-md bg-rose-500 flex items-center justify-center shrink-0">
                <AlertCircle className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground truncate">
                  {e.label} {t("dashboard.unpaidSuffix")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatCurrency(e.amount, cur)} · {t("dashboard.due")}{" "}
                  {relDate(e.date, t)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border",
                    severe
                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-900"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-900"
                  )}
                >
                  {days === 0
                    ? t("dashboard.overdue")
                    : t("dashboard.daysOverdue", { count: days })}
                </span>
                <button
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:opacity-75 transition-opacity"
                  aria-label={t("dashboard.markPaidNamed", { name: e.label })}
                  onClick={() => {
                    onMarkPaid(e.id);
                    dismiss(`exp-${e.id}`);
                  }}
                >
                  {t("dashboard.markPaid")}
                </button>
              </div>
            </div>
            );
          })}

          {visStale.map(r => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50"
            >
              <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center shrink-0">
                <AlertCircle className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground truncate">
                  {r.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.priority} · {r.status}
                  {r.contractor ? ` · ${r.contractor}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                  {t("dashboard.stale5d")}
                </span>
                <button
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900 hover:opacity-75 transition-opacity"
                  onClick={() => nav("/repairs")}
                >
                  {t("dashboard.updateStatus")}
                </button>
              </div>
            </div>
          ))}

          {visDecision.map(u => (
            <div
              key={u.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/50"
            >
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center shrink-0">
                <AlertCircle className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground truncate">
                  {u.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("dashboard.quotesReceived")}
                </p>
              </div>
              <button
                className="text-[11px] font-semibold px-2 py-1 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:opacity-75 transition-opacity shrink-0"
                onClick={() => nav(`/upgrades/${u.id}`)}
              >
                {t("dashboard.reviewQuotes")}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── CalendarCard ──────────────────────────────────────────────────────────────

function CalendarCard({ upcoming }: { upcoming: CalEvent[] }) {
  const { t } = useTranslation();
  const [, nav] = useLocation();

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <CardLabel>{t("dashboard.upcoming")}</CardLabel>
        <button
          className="flex items-center gap-1 text-xs text-primary hover:opacity-75 transition-opacity font-medium -mt-3"
          onClick={() => nav("/calendar")}
        >
          {t("dashboard.fullCalendar")} <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t("dashboard.nothingScheduled")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(e => {
            const d = new Date(e.date);
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-2 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer"
                onClick={() => nav("/calendar")}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[14px] font-extrabold text-primary leading-none">
                    {format(d, "d")}
                  </span>
                  <span className="text-[8.5px] font-bold uppercase text-primary/70">
                    {format(d, "MMM")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground truncate">
                    {e.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.category}
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── UpgradesCard ──────────────────────────────────────────────────────────────

function UpgradesCard({
  activeUpgrades,
  countMap,
  cur,
}: {
  activeUpgrades: ActiveUpgrade[];
  countMap: Record<string, { total: number; done: number }>;
  cur: string;
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const fmt = (n: number) => formatCurrency(n, cur);

  if (activeUpgrades.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <CardLabel>{t("dashboard.activeUpgrades")}</CardLabel>
        <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 -mt-3">
          {activeUpgrades.length} {t("upgrades.inProgress").toLowerCase()}
        </span>
      </div>
      <div className="space-y-0">
        {activeUpgrades.map(u => {
          const counts = countMap[u.id];
          return (
            <div
              key={u.id}
              className="flex items-center gap-3 py-2.5 border-t border-border first:border-t-0 -mx-1 px-1 rounded-md cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => nav(`/upgrades/${u.id}`)}
            >
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  STATUS_DOT[u.status ?? ""] ?? "bg-muted-foreground/40"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`status.${u.status}`, {
                    defaultValue: t("upgrades.inProgress"),
                  })}
                  {counts
                    ? ` · ${counts.done}/${counts.total} ${t("upgradeDetail.items").toLowerCase()}`
                    : ""}
                </p>
                <div className="h-[2px] w-full bg-border rounded-full overflow-hidden mt-1.5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      barColor(u.pct)
                    )}
                    style={{ width: `${Math.min(u.pct, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    u.pct >= 100
                      ? "text-rose-500"
                      : u.pct >= 80
                        ? "text-amber-500"
                        : ""
                  )}
                >
                  {fmt(u.spent)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  / {fmt(u.budget)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <button
        className="flex items-center gap-1 text-xs text-primary hover:opacity-75 transition-opacity mt-3 pt-3 border-t border-border font-medium"
        onClick={() => nav("/upgrades")}
      >
        {t("nav.upgrades")} <ArrowRight className="h-3 w-3" />
      </button>
    </Card>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const utils = trpc.useUtils();

  const { data: stats, isLoading, error } = trpc.dashboard.stats.useQuery();
  const { data: calEvents = [] } = trpc.calendar.list.useQuery({});

  const markPaid = trpc.expenses.markAsPaid.useMutation({
    onSuccess: () => utils.dashboard.stats.invalidate(),
  });

  const activeUpgradeIds = useMemo(
    () => (stats?.activeUpgrades ?? []).map(u => u.id),
    [stats?.activeUpgrades]
  );

  const { data: itemCounts = [] } = trpc.upgradeItems.countByUpgrade.useQuery(
    { upgradeIds: activeUpgradeIds },
    { enabled: activeUpgradeIds.length > 0 }
  );

  const countMap = useMemo(() => {
    const m: Record<string, { total: number; done: number }> = {};
    for (const c of itemCounts) m[c.upgradeId] = c;
    return m;
  }, [itemCounts]);

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

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12
      ? t("dashboard.goodMorning")
      : h < 18
        ? t("dashboard.goodAfternoon")
        : t("dashboard.goodEvening");
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  if (error || !stats)
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-[50vh] text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">
            {t("dashboard.loadError", "Couldn't load dashboard")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {error?.message ??
              t(
                "dashboard.loadErrorHint",
                "Your data may still be loading or no property is set up yet."
              )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/settings")}>
          <Settings className="h-3.5 w-3.5 me-1.5" />
          {t("nav.settings")}
        </Button>
      </div>
    );

  const s = stats;
  const cur = s.currency ?? "ILS";

  const hasLoans = (s.loanSummary?.length ?? 0) > 0;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
            {s.propertyName && (
              <>
                {" "}
                · <span className="text-foreground/70">{s.propertyName}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Bento grid — cards in the same row stretch to equal height via h-full on Card */}
      <div className="grid grid-cols-12 gap-3.5">
        {/* Row 1: Monthly spend + Loans (conditional) + Open Items */}
        <div
          className={cn(
            "col-span-12",
            hasLoans ? "lg:col-span-5" : "lg:col-span-9"
          )}
        >
          <SpendCard
            spent={s.monthSpent}
            baseline={s.monthlyRecurring}
            pct={s.monthPct}
            remaining={s.monthRemaining}
            cats={s.monthCats}
            cur={cur}
          />
        </div>

        {hasLoans && (
          <div className="col-span-12 lg:col-span-4">
            <LoansCard loans={s.loanSummary ?? []} cur={cur} />
          </div>
        )}

        <div className="col-span-12 lg:col-span-3">
          <OpenItemsCard
            openRepairs={s.openRepairs ?? []}
            overdueExpenses={s.overdueExpenses ?? []}
            activeUpgrades={s.activeUpgrades ?? []}
          />
        </div>

        {/* Row 2: Attention (8) + Calendar (4) */}
        <div className="col-span-12 lg:col-span-8">
          <AttentionCard
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

        <div className="col-span-12 lg:col-span-4">
          <CalendarCard upcoming={upcoming} />
        </div>

        {/* Row 3: Active upgrades (full width, only when present) */}
        {(s.activeUpgrades?.length ?? 0) > 0 && (
          <div className="col-span-12">
            <UpgradesCard
              activeUpgrades={s.activeUpgrades ?? []}
              countMap={countMap}
              cur={cur}
            />
          </div>
        )}
      </div>
    </div>
  );
}
