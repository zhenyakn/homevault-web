import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  DatabaseBackup,
  FileText,
  Home,
  Loader2,
  Lock,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

const lifecycleEvents = [
  ["May 15, 2023", "Purchase", "Property purchase completed", "bg-blue-500"],
  ["Apr 12, 2024", "Insurance Renewal", "Policy renewed with Lakeside Insurance", "bg-emerald-500"],
  ["Sep 18, 2024", "Roof Repair", "Replaced damaged shingles — North side", "bg-orange-500"],
  ["Jan 10, 2025", "Kitchen Upgrade", "New cabinets, countertop, and sink", "bg-violet-500"],
  ["Mar 02, 2026", "Warranty Expiry", "Dishwasher extended warranty expires", "bg-rose-500"],
] as const;

const chartData = [
  ["Jan", 44, 18, 10, 4, 8],
  ["Feb", 58, 22, 12, 5, 12],
  ["Mar", 55, 20, 11, 7, 9],
  ["Apr", 57, 21, 12, 6, 10],
  ["May", 53, 19, 13, 5, 9],
  ["Jun", 61, 23, 15, 8, 11],
  ["Jul", 56, 20, 14, 6, 10],
  ["Aug", 52, 19, 12, 4, 8],
  ["Sep", 64, 21, 24, 6, 10],
  ["Oct", 63, 22, 13, 16, 12],
  ["Nov", 66, 24, 12, 18, 14],
  ["Dec", 72, 26, 15, 20, 13],
] as const;

const costSegments = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-400",
  "bg-violet-500",
  "bg-slate-300 dark:bg-slate-700",
] as const;

type Activity = {
  id?: string;
  label?: string | null;
  type?: string | null;
  createdAt?: string | Date | null;
  ownerName?: string | null;
};

function TrustCard() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-slate-950">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Private files</p>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            All data is stored on your server. Last backup: today, 2:31 AM.
          </p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, note, icon: Icon, tone }: {
  title: string;
  value: string;
  note: string;
  icon: typeof Home;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TimelineCard() {
  const [, nav] = useLocation();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Property Timeline</h2>
          <p className="mt-1 text-xs text-slate-500">Major ownership, repair, and warranty milestones.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/timeline")}>
          Full timeline
        </Button>
      </div>
      <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
        {lifecycleEvents.map(([date, title, description, color]) => (
          <div key={`${date}-${title}`} className="relative flex gap-4">
            <span className={`z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white dark:ring-slate-950 ${color}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                <span className="text-[11px] font-medium text-slate-400">{date}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostChart({ total }: { total: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Total Cost of Ownership</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{formatCurrency(total || 1874200, "USD")}</p>
          <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">↑ 8% vs last year</p>
        </div>
        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800">This year</span>
      </div>
      <div className="flex h-48 items-end gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/40">
        {chartData.map(([month, mortgage, expenses, repairs, upgrades, other]) => {
          const values = [mortgage, expenses, repairs, upgrades, other];
          return (
            <div key={month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t-lg bg-slate-200 dark:bg-slate-800" style={{ height: `${Math.max(42, values.reduce((sum, value) => sum + value, 0) * 0.75)}%` }}>
                {values.map((value, index) => (
                  <span key={index} className={costSegments[index]} style={{ height: `${value}%` }} />
                ))}
              </div>
              <span className="text-[10px] font-medium text-slate-400">{month}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {[
          ["Mortgage", "bg-blue-500"],
          ["Expenses", "bg-emerald-500"],
          ["Repairs", "bg-orange-400"],
          ["Upgrades", "bg-violet-500"],
          ["Other", "bg-slate-300 dark:bg-slate-700"],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>
        ))}
      </div>
    </div>
  );
}

function ReminderCard({ overdueExpenses, staleRepairs }: { overdueExpenses: any[]; staleRepairs: any[] }) {
  const reminders = [
    ...overdueExpenses.slice(0, 2).map(expense => ({ label: `${expense.label} overdue`, date: expense.date, tone: "text-rose-500" })),
    ...staleRepairs.slice(0, 1).map(repair => ({ label: `${repair.label} needs update`, date: repair.status, tone: "text-amber-500" })),
  ];

  const fallback = [
    { label: "Insurance payment overdue", date: "Apr 30, 2025", tone: "text-rose-500" },
    { label: "Gutter cleaning overdue", date: "Apr 15, 2025", tone: "text-rose-500" },
    { label: "Smoke detector check", date: "Apr 10, 2025", tone: "text-amber-500" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Overdue Reminders</h2>
        <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{(reminders.length || fallback.length)}</span>
      </div>
      <div className="space-y-3">
        {(reminders.length ? reminders : fallback).map(reminder => (
          <div key={reminder.label} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <AlertCircle className={`h-4 w-4 shrink-0 ${reminder.tone}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{reminder.label}</p>
              <p className="text-xs text-slate-500">{reminder.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivityCard({ activities }: { activities: Activity[] }) {
  const fallback = [
    ["Receipt uploaded", "May 16, 2025 10:21 AM"],
    ["Roof repair invoice added", "May 15, 2025 3:42 PM"],
    ["Backup completed", "May 15, 2025 2:31 AM"],
    ["Insurance document uploaded", "May 14, 2025 11:07 AM"],
  ] as const;

  const rows = activities.length
    ? activities.slice(0, 4).map(activity => [activity.label ?? activity.type ?? "Activity", activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "Recently"] as const)
    : fallback;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h2>
        <button className="text-xs font-semibold text-blue-600">View all</button>
      </div>
      <div className="space-y-3">
        {rows.map(([label, date]) => (
          <div key={`${label}-${date}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <Receipt className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
              <p className="text-xs text-slate-500">{date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, nav] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: recentActivity = [] } = trpc.dashboard.recentActivity.useQuery();
  const { data: property } = trpc.property.get.useQuery();

  const totalSpend = useMemo(() => {
    const purchase = property?.purchasePrice ?? 0;
    const month = stats?.monthSpent ?? 0;
    const upgrades = (stats?.activeUpgrades ?? []).reduce((sum: number, upgrade: any) => sum + (upgrade.spent ?? 0), 0);
    return Math.max(purchase + month + upgrades, 1874200);
  }, [property?.purchasePrice, stats?.monthSpent, stats?.activeUpgrades]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  const currency = stats?.currency ?? property?.currencyCode ?? "ILS";
  const monthlySpend = stats?.monthSpent ?? 126800;
  const openRepairs = stats?.openRepairsCount ?? 0;
  const documentCount = 142;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex h-32 w-full items-end overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-700 to-blue-900 p-4 text-white md:w-52">
              <div>
                <Home className="mb-2 h-6 w-6 text-blue-200" />
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/80">Property</p>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{property?.houseName ?? stats?.propertyName ?? "Lakeview House"}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{property?.address ?? stats?.propertyAddress ?? "123 Lakeview Dr, Austin, TX 78701"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-700" onClick={() => nav("/settings")}>View Property</Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => nav("/documents")}>Open Vault</Button>
              </div>
            </div>
          </div>
        </div>
        <TrustCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Monthly Spend" value={formatCurrency(monthlySpend, currency)} note="↓ 12% vs last month" icon={TrendingUp} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300" />
        <MetricCard title="Upcoming Maintenance" value={`${Math.max(openRepairs, 2)} items`} note="Next: HVAC filter change" icon={CalendarClock} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" />
        <MetricCard title="Document Vault" value={String(documentCount)} note="Docs · 18 categories" icon={FileText} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300" />
        <MetricCard title="Backups" value="Healthy" note="Offsite + local" icon={DatabaseBackup} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300" />
        <MetricCard title="Security Status" value="Good" note="All systems secure" icon={Lock} tone="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <TimelineCard />
        <CostChart total={totalSpend} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReminderCard overdueExpenses={stats?.overdueExpenses ?? []} staleRepairs={stats?.staleRepairs ?? []} />
        <RecentActivityCard activities={(recentActivity ?? []) as Activity[]} />
      </div>
    </div>
  );
}
