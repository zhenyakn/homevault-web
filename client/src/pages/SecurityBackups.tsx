import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileText, KeyRound, LockKeyhole, ShieldCheck, Upload, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const auditRows = [
  ["May 15, 2025 10:21 AM", "Kevin", "File upload", "Roof Repair Invoice.pdf", "192.168.1.15"],
  ["May 15, 2025 09:14 AM", "Kevin", "Quote selected", "Bathroom leak", "192.168.1.15"],
  ["May 14, 2025 06:42 PM", "Lisa", "User login", "—", "192.168.1.42"],
  ["May 14, 2025 04:11 PM", "Kevin", "Export created", "Documents Export", "192.168.1.15"],
  ["May 14, 2025 11:07 AM", "Lisa", "File upload", "Insurance Policy 2025.pdf", "192.168.1.42"],
];

const cards = [
  { title: "Backup & Restore", description: "Protect your data with regular backups and easy restore options.", icon: DatabaseBackup, lines: ["Last backup: May 15, 2025 2:31 AM", "Status: Healthy"], action: "Manage backups" },
  { title: "Session Settings", description: "Configure authentication, signed sessions, and timeouts.", icon: KeyRound, lines: ["OAuth: Enabled", "Session timeout: 30 minutes"], action: "Configure" },
  { title: "User Roles", description: "Manage household roles and permissions.", icon: UsersRound, lines: ["Active users: 4", "Roles: 3"], action: "Manage users" },
  { title: "Import / Export", description: "Import data or export your information securely.", icon: Download, lines: ["Last export: May 10, 2025", "Format: JSON + attachments"], action: "Import / Export" },
  { title: "App Protections", description: "Harden HomeVault with app-layer controls.", icon: ShieldCheck, lines: ["Private links: On", "Request limits: On"], action: "Configure" },
];

const permissions = [
  ["View Dashboard", true, true, true, false],
  ["Manage Documents", true, true, true, false],
  ["Manage Repairs", true, true, false, false],
  ["Manage Finances", true, true, false, false],
  ["System Settings", true, false, false, false],
  ["Manage Users", true, false, false, false],
] as const;

function StatusMark({ value }: { value: boolean }) {
  return value ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="mx-auto block h-4 w-4 text-center text-sm font-bold leading-4 text-rose-500">×</span>;
}

export default function SecurityBackups() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security & Backups</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational controls for a self-hosted vault: backups, sessions, roles, exports, and auditability.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" className="gap-2 rounded-xl"><Upload className="h-4 w-4" />Import</Button><Button className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700"><DatabaseBackup className="h-4 w-4" />Backup now</Button></div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
        <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 shrink-0" />Local bypass mode should only be used behind Home Assistant ingress.</div>
        <Button variant="outline" size="sm" className="hidden rounded-xl bg-white/70 sm:inline-flex dark:bg-slate-950/30">View documentation</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(card => <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"><card.icon className="h-5 w-5" /></div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{card.title}</h2>
          <p className="mt-1 min-h-[44px] text-xs leading-5 text-slate-500 dark:text-slate-400">{card.description}</p>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">{card.lines.map(line => <p key={line} className="text-xs text-slate-600 dark:text-slate-300">{line}</p>)}</div>
          <Button variant="outline" size="sm" className="mt-4 w-full rounded-xl">{card.action}</Button>
        </div>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">Audit Log</h2><p className="mt-1 text-xs text-slate-500">Authentication, file, export, and admin actions.</p></div><Button variant="outline" size="sm" className="gap-2 rounded-xl"><FileText className="h-4 w-4" />Full audit log</Button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-100 text-xs uppercase tracking-[0.12em] text-slate-400 dark:border-slate-800"><tr><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">User</th><th className="px-4 py-3 font-semibold">Action</th><th className="px-4 py-3 font-semibold">Resource</th><th className="px-4 py-3 font-semibold">IP Address</th></tr></thead><tbody>{auditRows.map(row => <tr key={row.join("")} className="border-b border-slate-100 dark:border-slate-800">{row.map((cell, index) => <td key={index} className={`px-4 py-3 ${index === 1 ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"}`}>{cell}</td>)}</tr>)}</tbody></table></div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800"><h2 className="font-semibold text-slate-900 dark:text-slate-100">User Roles & Permissions</h2><p className="mt-1 text-xs text-slate-500">Role-based access for household and guest users.</p></div>
          <div className="overflow-x-auto p-4"><table className="w-full text-sm"><thead className="text-xs text-slate-400"><tr><th className="pb-3 text-left font-semibold">Permission</th><th className="pb-3 font-semibold">Admin</th><th className="pb-3 font-semibold">Manager</th><th className="pb-3 font-semibold">Viewer</th><th className="pb-3 font-semibold">Guest</th></tr></thead><tbody>{permissions.map(([label, admin, manager, viewer, guest]) => <tr key={label} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3 pr-2 text-xs font-medium text-slate-700 dark:text-slate-300">{label}</td><td><StatusMark value={admin} /></td><td><StatusMark value={manager} /></td><td><StatusMark value={viewer} /></td><td><StatusMark value={guest} /></td></tr>)}</tbody></table></div>
        </aside>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />HomeVault keeps your data private, secure, and under your control.</div><div className="flex gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-slate-950/40 dark:text-emerald-300 dark:ring-emerald-900/50">Self-hosted</span><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-slate-950/40 dark:text-emerald-300 dark:ring-emerald-900/50">Private files</span><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-slate-950/40 dark:text-emerald-300 dark:ring-emerald-900/50">Backups healthy</span></div></div>
    </div>
  );
}
