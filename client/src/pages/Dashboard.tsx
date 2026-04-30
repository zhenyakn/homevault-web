import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Settings } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, addDays } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASE_DOT: Record<string, string> = {
  Building: "bg-orange-400",
  Sourcing:  "bg-blue-400",
  Planning:  "bg-violet-400",
  Done:      "bg-emerald-400",
};

const CAT_COLOR: Record<string, string> = {
  Mortgage:    "#6366f1",
  Utility:     "#eab308",
  Insurance:   "#a855f7",
  Tax:         "#f43f5e",
  Maintenance: "#f97316",
  Other:       "#9ca3af",
};

const LOAN_BAR = ["bg-indigo-500", "bg-violet-500", "bg-blue-500", "bg-cyan-500"];

function barColor(pct: number) {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80)  return "bg-amber-400";
  return "bg-indigo-500";
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── AttentionZone ─────────────────────────────────────────────────────────────

function AttentionZone({ overdue, stale, decisionNeeded, cur, onMarkPaid }: {
  overdue: any[];
  stale: any[];
  decisionNeeded: any[];
  cur: string;
  onMarkPaid: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (k: string) => setDismissed(p => new Set([...Array.from(p), k]));

  const visOverdue   = overdue.filter(e => !dismissed.has(`exp-${e.id}`));
  const visStale     = stale.filter(r => !dismissed.has(`rep-${r.id}`));
  const visDecision  = decisionNeeded.filter(u => !dismissed.has(`upg-${u.id}`));
  const total = visOverdue.length + visStale.length + visDecision.length;

  const relDate = (d: string) => {
    const dt = new Date(d);
    if (isToday(dt))    return t("dashboard.today");
    if (isTomorrow(dt)) return t("dashboard.tomorrow");
    return format(dt, "MMM d");
  };

  if (total === 0) return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-6">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {t("dashboard.noAttention")}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {visOverdue.map(e => (
        <div key={e.id} className="rounded-lg border border-border border-l-2 border-l-rose-500 bg-card p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug">{e.label} {t("dashboard.unpaidSuffix")}</p>
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900 whitespace-nowrap shrink-0">
              {t("dashboard.overdue")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(e.amount, cur)} · {t("dashboard.due")} {relDate(e.date)}
          </p>
          <button
            className="self-start text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:opacity-75 transition-opacity"
            onClick={() => { onMarkPaid(e.id); dismiss(`exp-${e.id}`); }}
          >
            {t("dashboard.markPaid")}
          </button>
        </div>
      ))}

      {visStale.map(r => (
        <div key={r.id} className="rounded-lg border border-border border-l-2 border-l-amber-400 bg-card p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug truncate">{r.label}</p>
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900 whitespace-nowrap shrink-0">
              {t("dashboard.stale5d")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {r.priority} · {r.status}{r.contractor ? ` · ${r.contractor}` : ""}
          </p>
          <button
            className="self-start text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900 hover:opacity-75 transition-opacity"
            onClick={() => nav("/repairs")}
          >
            {t("dashboard.updateStatus")}
          </button>
        </div>
      ))}

      {visDecision.map(u => (
        <div key={u.id} className="rounded-lg border border-border border-l-2 border-l-blue-400 bg-card p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug truncate">{u.label}</p>
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900 whitespace-nowrap shrink-0">
              {t("dashboard.decisionNeeded")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.quotesReceived")}
          </p>
          <button
            className="self-start text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900 hover:opacity-75 transition-opacity"
            onClick={() => nav(`/upgrades/${u.id}`)}
          >
            {t("dashboard.reviewQuotes")}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── SpendCard ─────────────────────────────────────────────────────────────────

function SpendCard({ spent, baseline, pct, remaining, cats, cur }: {
  spent: number; baseline: number; pct: number; remaining: number;
  cats: Record<string, number>; cur: string;
}) {
  const { t } = useTranslation();
  const fmt = (n: number) => formatCurrency(n, cur);
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const top = Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 5);

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {t("dashboard.monthlySpend")}
        </p>
        <p className="text-xs text-muted-foreground">{daysLeft} {t("dashboard.daysLeft")}</p>
      </div>

      <div className="text-2xl font-bold tracking-tight tabular-nums">{fmt(spent)}</div>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        {t("expenses.of")} {fmt(baseline)} {t("dashboard.ofRecurringBaseline")}
        {remaining > 0 && (
          <> · <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmt(remaining)} {t("dashboard.remaining")}</span></>
        )}
      </p>

      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden mb-1.5">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor(pct))}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground text-right mb-4">{pct}{t("dashboard.ofBaseline")}</p>

      {top.map(([cat, amount]) => (
        <div key={cat} className="flex items-center gap-2.5 py-1.5 border-t border-border">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: CAT_COLOR[cat] ?? "#9ca3af" }}
          />
          <span className="flex-1 text-xs text-muted-foreground">{cat}</span>
          <div className="w-14 h-[3px] bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${spent > 0 ? Math.round((amount / spent) * 100) : 0}%`,
                background: CAT_COLOR[cat] ?? "#9ca3af",
              }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums w-16 text-right">{fmt(amount)}</span>
        </div>
      ))}

      {baseline === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {t("dashboard.addRecurring")}
        </p>
      )}
    </div>
  );
}

// ── CalendarCard ──────────────────────────────────────────────────────────────

function CalendarCard({ calEvents, upcoming }: { calEvents: any[]; upcoming: any[] }) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const today = new Date();

  const relDate = (d: string) => {
    const dt = new Date(d);
    if (isToday(dt))    return t("dashboard.today");
    if (isTomorrow(dt)) return t("dashboard.tomorrow");
    return format(dt, "MMM d");
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const hasEvent = calEvents.some(e => (e.date as string)?.startsWith(dateStr));
    return { d, dateStr, hasEvent };
  });

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {t("dashboard.next7days")}
        </p>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => nav("/calendar")}
        >
          {t("dashboard.fullCalendar")}
        </button>
      </div>

      <div className="flex gap-1.5 mb-4">
        {days.map(({ d, hasEvent }) => (
          <div
            key={format(d, "yyyy-MM-dd")}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border",
              isToday(d)
                ? "bg-indigo-500 border-indigo-500 text-white"
                : hasEvent
                  ? "border-indigo-200/70 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-900/40"
                  : "border-border bg-muted/20"
            )}
          >
            <span className={cn(
              "text-[9.5px] font-semibold uppercase tracking-wide",
              isToday(d) ? "text-white/70" : "text-muted-foreground"
            )}>
              {format(d, "EEE")}
            </span>
            <span className="text-sm font-bold">{format(d, "d")}</span>
            <div className="h-1 flex items-center justify-center">
              {hasEvent && (
                <div className={cn(
                  "w-1 h-1 rounded-full",
                  isToday(d) ? "bg-white/70" : "bg-indigo-500"
                )} />
              )}
            </div>
          </div>
        ))}
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("dashboard.nothingScheduled")}
        </p>
      ) : (
        upcoming.map(e => (
          <div key={e.id} className="flex items-center gap-3 py-1.5 border-t border-border">
            <span className="text-[11px] font-semibold text-muted-foreground w-10 shrink-0">
              {relDate(e.date)}
            </span>
            <span className="flex-1 text-sm truncate">{e.title}</span>
            <span className="text-[10.5px] text-muted-foreground shrink-0">{e.eventType}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ── UpgradesCard ──────────────────────────────────────────────────────────────

function UpgradesCard({ activeUpgrades, countMap, cur }: {
  activeUpgrades: any[];
  countMap: Record<string, { total: number; done: number }>;
  cur: string;
}) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const fmt = (n: number) => formatCurrency(n, cur);

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {t("dashboard.activeUpgrades")}
        </p>
        {activeUpgrades.length > 0 && (
          <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400 border border-violet-200 dark:border-violet-900">
            {activeUpgrades.length} {t("upgrades.inProgress").toLowerCase()}
          </span>
        )}
      </div>

      {activeUpgrades.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noActiveUpgrades")}</p>
      ) : (
        <>
          {activeUpgrades.map(u => {
            const counts = countMap[u.id];
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 py-2.5 border-t border-border -mx-1 px-1 rounded-md cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => nav(`/upgrades/${u.id}`)}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  PHASE_DOT[u.phase ?? ""] ?? "bg-muted-foreground/40"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {u.phase ?? t("upgrades.inProgress")}
                    {counts ? ` · ${counts.done}/${counts.total} ${t("upgradeDetail.items").toLowerCase()}` : ""}
                  </p>
                  <div className="h-[2px] w-full bg-border rounded-full overflow-hidden mt-1.5">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor(u.pct))}
                      style={{ width: `${Math.min(u.pct, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-sm font-bold tabular-nums",
                    u.pct >= 100 ? "text-rose-500" : u.pct >= 80 ? "text-amber-500" : ""
                  )}>
                    {fmt(u.spent)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">/ {fmt(u.budget)}</p>
                </div>
              </div>
            );
          })}
          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-3 pt-3 border-t border-border"
            onClick={() => nav("/upgrades")}
          >
            {t("nav.upgrades")} →
          </button>
        </>
      )}
    </div>
  );
}

// ── LoansCard ─────────────────────────────────────────────────────────────────

function LoansCard({ loans, cur }: { loans: any[]; cur: string }) {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const fmt = (n: number) => formatCurrency(n, cur);

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          {t("loans.title")}
        </p>
      </div>

      {loans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard.noActiveLoans")}</p>
      ) : (
        <>
          {loans.map((l, i) => {
            const repaid    = l.repaid    ?? 0;
            const remaining = l.remaining ?? Math.max(0, (l.totalAmount ?? 0) - repaid);
            const pct       = l.pct       ?? 0;
            return (
              <div key={l.id} className={cn(i > 0 && "pt-3 mt-3 border-t border-border")}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{l.lender}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.loanType}
                      {l.interestRate ? ` · ${l.interestRate}%` : ""}
                    </p>
                  </div>
                  {l.paidOff ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" /> {t("common.paidOff")}
                    </span>
                  ) : (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{fmt(remaining)}</p>
                      <p className="text-[11px] text-muted-foreground">{t("dashboard.remaining")}</p>
                    </div>
                  )}
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden mb-1.5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      l.paidOff ? "bg-emerald-500" : LOAN_BAR[i % LOAN_BAR.length]
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{fmt(repaid)} {t("loans.repaid")} · {pct}%</span>
                  {l.dueDate && (
                    <span>until {format(new Date(l.dueDate), "MMM yyyy")}</span>
                  )}
                </div>
              </div>
            );
          })}
          <button
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-3 pt-3 border-t border-border"
            onClick={() => nav("/loans")}
          >
            {t("loans.title")} →
          </button>
        </>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation();
  const [, nav] = useLocation();
  const utils = trpc.useUtils();

  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: calEvents = [] }   = trpc.calendar.list.useQuery({});

  const markPaid = trpc.expenses.markAsPaid.useMutation({
    onSuccess: () => utils.dashboard.stats.invalidate(),
  });

  const activeUpgradeIds = useMemo(
    () => (stats?.activeUpgrades ?? []).map((u: any) => u.id),
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
    return (calEvents as any[])
      .filter(e => { const d = new Date(e.date); return d >= now && d <= in7; })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6);
  }, [calEvents]);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? t("dashboard.goodMorning") : h < 18 ? t("dashboard.goodAfternoon") : t("dashboard.goodEvening");
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const s = stats!;
  const cur = s?.currency ?? "ILS";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/settings")}>
          <Settings className="h-3.5 w-3.5 me-1.5" />
          {t("nav.settings")}
        </Button>
      </div>

      {/* Layer 1 — Needs attention */}
      <SectionLabel>{t("dashboard.attention")}</SectionLabel>
      <AttentionZone
        overdue={s?.overdueExpenses ?? []}
        stale={s?.staleRepairs ?? []}
        decisionNeeded={s?.upgradesNeedingDecision ?? []}
        cur={cur}
        onMarkPaid={id =>
          markPaid.mutate({ id, paidDate: new Date().toISOString().split("T")[0] })
        }
      />

      {/* Layer 2 — This month */}
      <SectionLabel>{format(new Date(), "MMMM yyyy")}</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <SpendCard
          spent={s.monthSpent}
          baseline={s.monthlyRecurring}
          pct={s.monthPct}
          remaining={s.monthRemaining}
          cats={s.monthCats}
          cur={cur}
        />
        <CalendarCard calEvents={calEvents as any[]} upcoming={upcoming} />
      </div>

      {/* Layer 3 — Running context */}
      <SectionLabel>{t("dashboard.context")}</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpgradesCard
          activeUpgrades={s?.activeUpgrades ?? []}
          countMap={countMap}
          cur={cur}
        />
        <LoansCard loans={s?.loanSummary ?? []} cur={cur} />
      </div>
    </div>
  );
}
