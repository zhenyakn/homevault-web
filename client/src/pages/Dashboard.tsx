/**
 * Overview
 * Operational view — what needs attention, what's happening this month,
 * what's coming up. Static data (total invested, map, wishlist total)
 * lives in Settings and module pages, not here.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, MapPin, AlertTriangle, CheckCircle2, X, Receipt, Wrench, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_PIPE: Record<string, string> = {
  Expense: "bg-blue-500", Repair: "bg-orange-500",
  Upgrade: "bg-green-500", Loan: "bg-purple-500", Other: "bg-zinc-400",
};
const PRIORITY_BAR: Record<string, string> = {
  Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-yellow-400", Low: "bg-zinc-300",
};
const STATUS_BADGE: Record<string, string> = {
  "Pending":     "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "Resolved":    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};
const CAT_COLORS: Record<string, string> = {
  Mortgage: "bg-blue-500", Utility: "bg-yellow-400", Insurance: "bg-purple-500",
  Tax: "bg-red-400", Maintenance: "bg-orange-400", Other: "bg-zinc-400",
};
const ACTIVITY_ICONS: Record<string, any> = { expense: Receipt, repair: Wrench, upgrade: ShoppingCart };

const ini = (n?: string | null) => (n ?? "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relDate(d: string) {
  const dt = new Date(d);
  if (isToday(dt)) return "Today";
  if (isTomorrow(dt)) return "Tomorrow";
  return format(dt, "MMM d");
}

// ── Attention zone ─────────────────────────────────────────────────────────────

function AttentionZone({ overdue, stale, cur }: { overdue: any[]; stale: any[]; cur: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (k: string) => setDismissed(p => new Set([...p, k]));
  const visOverdue = overdue.filter(e => !dismissed.has(`exp-${e.id}`));
  const visStale   = stale.filter(r => !dismissed.has(`rep-${r.id}`));
  const total = visOverdue.length + visStale.length;

  if (total === 0) return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 text-sm text-green-700 dark:text-green-400 mb-5">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      Everything looks good — no pending actions today
    </div>
  );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 overflow-hidden mb-5">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 dark:border-amber-900/60">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Needs attention</span>
        <span className="ml-1 inline-flex items-center px-1.5 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">{total}</span>
      </div>
      {visOverdue.map(e => (
        <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-amber-100 dark:border-amber-900/40 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{e.label} unpaid</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(e.amount, cur)} · due {relDate(e.date)}</p>
          </div>
          <button className="text-xs px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors" onClick={() => dismiss(`exp-${e.id}`)}>
            Mark paid
          </button>
        </div>
      ))}
      {visStale.map(r => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-amber-100 dark:border-amber-900/40 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.label} — no update in 5+ days</p>
            <p className="text-xs text-muted-foreground mt-0.5">{r.priority} · {r.status}{r.contractor ? ` · ${r.contractor}` : " · No contractor"}</p>
          </div>
          <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-amber-200 dark:hover:bg-amber-900/40 transition-colors" onClick={() => dismiss(`rep-${r.id}`)}>
            <X className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── This month ─────────────────────────────────────────────────────────────────

function ThisMonth({ spent, baseline, pct, remaining, cats, cur }: {
  spent: number; baseline: number; pct: number; remaining: number;
  cats: Record<string, number>; cur: string;
}) {
  const fmt = (c: number) => formatCurrency(c, cur);
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
  const topCats = Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 4);

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-5">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {format(new Date(), "MMMM yyyy")}
        </p>
        <p className="text-xs text-muted-foreground">{daysLeft} days remaining</p>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold tabular-nums tracking-tight">{fmt(spent)}</span>
          <span className="text-sm text-muted-foreground">of {fmt(baseline)} expected</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden mb-2">
          <div
            className={cn("h-full rounded-full transition-all duration-700",
              pct > 90 ? "bg-red-500" : pct > 70 ? "bg-orange-400" : "bg-foreground/60")}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mb-4">
          <span>{fmt(remaining)} remaining</span>
          <span>{pct}% of recurring baseline</span>
        </div>
        {topCats.length > 0 && (
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-border">
            {topCats.map(([cat, amount]) => (
              <div key={cat} className="text-center">
                <div className={cn("h-0.5 rounded-full mx-auto mb-1.5 opacity-70", CAT_COLORS[cat] ?? "bg-zinc-400")}
                  style={{ width: `${spent > 0 ? Math.round((amount / spent) * 100) : 0}%`, maxWidth: "100%" }} />
                <p className="text-[11px] text-muted-foreground">{cat}</p>
                <p className="text-xs font-medium tabular-nums">{fmt(amount)}</p>
              </div>
            ))}
          </div>
        )}
        {baseline === 0 && (
          <p className="text-xs text-muted-foreground mt-2">Add recurring expenses to see your monthly baseline</p>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, nav] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: calEvents } = trpc.calendar.list.useQuery({});
  const { data: activity, isLoading: actLoading } = trpc.dashboard.recentActivity.useQuery();

  const upcoming = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return (calEvents || [])
      .filter((e: any) => { const d = new Date(e.date); return d >= now && d <= in7; })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  }, [calEvents]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const s = stats!;
  const cur = s?.currency ?? "₪";
  const fmt = (c: number) => formatCurrency(c, cur);

  return (
    <div>
      {/* Greeting */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold">{greeting()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
            {s?.propertyAddress && (
              <> · <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.propertyName}</span></>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/settings")}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />Settings
        </Button>
      </div>

      {/* 1. Attention */}
      {s && <AttentionZone overdue={s.overdueExpenses} stale={s.staleRepairs} cur={cur} />}

      {/* 2. This month */}
      {s && <ThisMonth spent={s.monthSpent} baseline={s.monthlyRecurring} pct={s.monthPct} remaining={s.monthRemaining} cats={s.monthCats} cur={cur} />}

      {/* 3. Next 7 days + Open repairs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Next 7 days</p>
            <button onClick={() => nav("/calendar")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Full calendar →</button>
          </div>
          {upcoming.length === 0 ? (
            <div className="border border-border rounded-lg px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing scheduled this week</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {upcoming.map((event: any) => (
                <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="text-center w-9 shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none mb-0.5">{format(new Date(event.date), "MMM")}</p>
                    <p className="text-base font-bold tabular-nums leading-tight">{format(new Date(event.date), "dd")}</p>
                  </div>
                  <div className={cn("w-0.5 h-8 rounded-full shrink-0", EVENT_PIPE[event.eventType] ?? "bg-zinc-400")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.eventType}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              Open repairs
              {s?.openRepairsCount ? <span className="ml-1.5 text-muted-foreground font-normal text-xs">{s.openRepairsCount}</span> : null}
            </p>
            <button onClick={() => nav("/repairs")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">All repairs →</button>
          </div>
          {!s?.openRepairs?.length ? (
            <div className="border border-border rounded-lg px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No open repairs</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {s.openRepairs.map((r: any) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={cn("w-0.5 h-9 rounded-full shrink-0 mt-0.5", PRIORITY_BAR[r.priority] ?? "bg-zinc-300")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.contractor || "No contractor"} · {r.priority}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded shrink-0 font-medium", STATUS_BADGE[r.status])}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Active upgrades + Loan paydown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Active upgrades</p>
            <button onClick={() => nav("/upgrades")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">All upgrades →</button>
          </div>
          {!s?.activeUpgrades?.length ? (
            <div className="border border-border rounded-lg px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No upgrades in progress</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {s.activeUpgrades.map((u: any) => (
                <div key={u.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{u.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{fmt(u.spent)} / {fmt(u.budget)}</p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/60 transition-all" style={{ width: `${u.pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                    <span>{u.pct}% of budget used</span>
                    <span>{fmt(u.budget - u.spent)} remaining</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Loan paydown</p>
            <button onClick={() => nav("/loans")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">All loans →</button>
          </div>
          {!s?.loanSummary?.length ? (
            <div className="border border-border rounded-lg px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No loans added</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {s.loanSummary.map((l: any) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-sm font-medium">{l.lender}</p>
                      {l.paidOff
                        ? <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Paid off</span>
                        : <span className="text-xs text-muted-foreground tabular-nums">{l.pct}%</span>}
                    </div>
                    <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", l.paidOff ? "bg-green-500" : "bg-foreground/60")} style={{ width: `${l.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Household activity feed */}
      <div>
        <p className="text-sm font-medium mb-2">Household activity</p>
        {actLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !activity?.length ? (
          <div className="border border-border rounded-lg px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No activity yet — add an expense, log a repair, or plan an upgrade</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {activity.map((item: any) => {
              const Icon = ACTIVITY_ICONS[item.type] || Receipt;
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px]">{ini(item.ownerName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="font-medium">{item.ownerName || "You"} </span>
                    <span className="text-muted-foreground">{item.type === "expense" ? "added expense" : item.type === "repair" ? "logged repair" : "updated upgrade"}:</span>
                    {" "}<span className="font-medium">{item.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {item.createdAt ? format(new Date(item.createdAt), "MMM d") : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
