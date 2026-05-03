import { CalendarClock, CheckCircle2, ClipboardList, FileText, Home, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const timeline = [
  { date: "May 15, 2023", title: "Purchase completed", description: "Property purchase closed and baseline property profile created.", type: "Purchase", icon: Home, tone: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50" },
  { date: "Apr 12, 2024", title: "Insurance renewed", description: "Lakeside Insurance policy renewed and linked to the document vault.", type: "Insurance", icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50" },
  { date: "Sep 18, 2024", title: "Roof repair completed", description: "Replaced damaged shingles on the north side. Warranty attached.", type: "Repair", icon: Wrench, tone: "bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900/50" },
  { date: "Jan 10, 2025", title: "Kitchen upgrade finished", description: "New cabinets, countertop, sink, invoices, and warranty metadata captured.", type: "Upgrade", icon: Sparkles, tone: "bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/50" },
  { date: "Mar 02, 2026", title: "Dishwasher warranty expires", description: "Extended warranty expiry reminder generated from document metadata.", type: "Warranty", icon: CalendarClock, tone: "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50" },
];

const packages = [
  ["Insurance claim packet", "Photos, invoice, contractor quote, timeline notes", "Ready"],
  ["Annual tax folder", "Receipts, mortgage statements, municipal tax docs", "In progress"],
  ["Sale preparation pack", "Permits, warranties, upgrades, ownership history", "Draft"],
];

export default function Timeline() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Property Timeline</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A lifecycle view of your home: purchase, maintenance, documents, warranties, upgrades, and future obligations.</p>
        </div>
        <Button className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700"><ClipboardList className="h-4 w-4" />Generate report</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-6 flex items-center justify-between">
            <div><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lakeview House</p><p className="text-xs text-slate-500">123 Lakeview Dr · Austin, TX 78701</p></div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">5 lifecycle milestones</span>
          </div>
          <div className="relative space-y-6 before:absolute before:bottom-2 before:left-[18px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
            {timeline.map(event => (
              <div key={event.title} className="relative flex gap-4">
                <div className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${event.tone}`}><event.icon className="h-4 w-4" /></div>
                <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div><div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-slate-100">{event.title}</h3><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">{event.type}</span></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.description}</p></div>
                    <p className="text-xs font-semibold text-slate-400">{event.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lifecycle health</p>
            <div className="mt-4 space-y-4">
              {[["Documents linked","142","18 categories"],["Open obligations","4","2 reminders overdue"],["Warranty coverage","11","3 expiring this year"],["Backup status","Healthy","Last backup today"]].map(([label,value,note]) => <div key={label} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><strong className="text-sm text-slate-900 dark:text-slate-100">{value}</strong></div><p className="mt-1 text-xs text-slate-400">{note}</p></div>)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prepared document packs</p></div>
            <div className="space-y-3">{packages.map(([title, description, status]) => <div key={title} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-900">{status}</span></div><p className="mt-1 text-xs text-slate-500">{description}</p></div>)}</div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5 shrink-0" />Timeline entries stay tied to source documents and user actions for auditability.</div>
        </aside>
      </div>
    </div>
  );
}
