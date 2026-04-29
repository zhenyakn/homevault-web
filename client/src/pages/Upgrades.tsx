import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Plus, Trash2, Download, AlertTriangle, CheckCircle2,
  Hammer, ListChecks, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types & constants ────────────────────────────────────────────────────────

type UpgradeStatus = "Planned" | "In Progress" | "Done";
type Phase = "Planning" | "Sourcing" | "Building" | "Done";

const PHASE_ORDER: Record<string, number> = { Building: 0, Sourcing: 1, Planning: 2, Done: 3 };

const PHASE_BADGE: Record<string, string> = {
  Planning: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Sourcing: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Building: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  Done:     "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

function barColor(spent: number, budget: number) {
  if (budget === 0) return "bg-primary";
  const pct = spent / budget;
  if (pct >= 1)   return "bg-red-500";
  if (pct >= 0.8) return "bg-amber-400";
  return "bg-primary";
}

// ─── Add project dialog ───────────────────────────────────────────────────────

function AddProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const createMutation = trpc.upgrades.create.useMutation({
    onSuccess: () => {
      toast.success("Project created");
      utils.upgrades.list.invalidate();
      onClose();
    },
    onError: e => toast.error(`Failed to create project: ${e.message}`),
  });

  const blank = { label: "", description: "", budget: "", notes: "" };
  const [f, setF] = useState(blank);

  useEffect(() => { if (!open) setF(blank); }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      label: f.label,
      description: f.description || undefined,
      status: "Planned",
      phase: "Planning",
      budget: Math.round(parseFloat(f.budget) * 100),
      notes: f.notes || undefined,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Project name *</Label>
            <Input
              id="label"
              required
              placeholder="e.g. Kitchen renovation"
              value={f.label}
              onChange={e => setF({ ...f, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="What does this project cover?"
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">Budget envelope (₪) *</Label>
            <Input
              id="budget"
              type="number"
              step="0.01"
              required
              placeholder="0"
              value={f.budget}
              onChange={e => setF({ ...f, budget: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Your total spending target for this project. You'll track vendor quotes and payments inside the project.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create project
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upgrade card row ─────────────────────────────────────────────────────────

function UpgradeRow({
  upgrade, counts, isDone, onDelete, onClick,
}: {
  upgrade: any;
  counts?: { total: number; done: number; needsAction: number };
  isDone: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const phase: Phase = (upgrade.phase as Phase) || "Planning";
  const spent = upgrade.spent ?? 0;
  const budget = upgrade.budget;
  const progress = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  return (
    <div
      className={cn(
        "flex items-start gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer",
        isDone && "opacity-70",
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-medium", isDone && "text-muted-foreground")}>{upgrade.label}</p>
          <Badge className={cn("text-xs h-5 border-0 shrink-0", PHASE_BADGE[phase])}>{phase}</Badge>
        </div>

        {/* Description */}
        {upgrade.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{upgrade.description}</p>
        )}

        {/* Item counts row */}
        {counts && counts.total > 0 && (
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              {counts.done}/{counts.total} items done
            </span>
            {counts.needsAction > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {counts.needsAction} need action
              </span>
            )}
            {isDone && counts.done === counts.total && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />All complete
              </span>
            )}
          </div>
        )}

        {/* Budget bar */}
        {!isDone && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatCurrency(spent)} paid
                {spent > budget && <span className="text-red-500 font-medium ml-1">· over budget</span>}
              </span>
              <span className="tabular-nums">{formatCurrency(budget)} envelope</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className={cn("h-full transition-all rounded-full", barColor(spent, budget))}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done: show final spend */}
        {isDone && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {formatCurrency(spent)} invested
          </p>
        )}
      </div>

      {/* Delete button */}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete project"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, count, extra, children, empty,
}: {
  title: string; count: number; extra?: React.ReactNode; children: React.ReactNode; empty?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        {extra}
      </div>
      {count === 0
        ? empty
        : <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">{children}</div>
      }
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Upgrades() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: upgrades = [], isLoading } = trpc.upgrades.list.useQuery();

  const upgradeIds = upgrades.map(u => u.id);
  const { data: rawCounts = [] } = trpc.upgradeItems.countByUpgrade.useQuery(
    { upgradeIds },
    { enabled: upgradeIds.length > 0 },
  );
  const countMap = Object.fromEntries(rawCounts.map(c => [c.upgradeId, c]));

  const deleteMutation = trpc.upgrades.delete.useMutation({
    onSuccess: () => { toast.success("Project deleted"); utils.upgrades.list.invalidate(); },
    onError: e => toast.error(`Failed to delete: ${e.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleExportCSV = () => {
    if (!upgrades.length) { toast.error("No projects to export"); return; }
    const headers = ["Name", "Phase", "Status", "Budget", "Paid", "Remaining", "Notes"];
    const rows = upgrades.map((u: any) => [
      u.label, u.phase || "Planning", u.status,
      (u.budget / 100).toFixed(2),
      ((u.spent || 0) / 100).toFixed(2),
      ((u.budget - (u.spent || 0)) / 100).toFixed(2),
      u.notes || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `upgrades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("Exported to CSV");
  };

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  // ── Sections ────────────────────────────────────────────────────────────────
  const inProgress = upgrades
    .filter(u => u.status === "In Progress")
    .sort((a, b) => (PHASE_ORDER[(a as any).phase] ?? 3) - (PHASE_ORDER[(b as any).phase] ?? 3));

  const planned = upgrades
    .filter(u => u.status === "Planned")
    .sort((a, b) => b.budget - a.budget);

  const done = upgrades
    .filter(u => u.status === "Done");

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeBudget  = inProgress.reduce((s, u) => s + u.budget, 0);
  const activePaid    = inProgress.reduce((s, u) => s + (u.spent ?? 0), 0);
  const investedTotal = done.reduce((s, u) => s + (u.spent ?? 0), 0);
  const doneTotalInvestment = done.reduce((s, u) => s + (u.spent ?? 0), 0);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!upgrades.length) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("upgrades.title")}</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />{t("upgrades.newProject")}
          </Button>
        </div>

        <div className="border border-dashed border-border rounded-xl p-10 text-center space-y-4">
          <div className="flex justify-center gap-4 text-muted-foreground/40">
            <Hammer className="h-8 w-8" />
            <ListChecks className="h-8 w-8" />
            <FolderOpen className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("upgrades.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {t("upgrades.emptyDesc")}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />{t("upgrades.startFirst")}
          </Button>
        </div>

        <AddProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("upgrades.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={handleExportCSV} title={t("common.exportCsv")}>
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />{t("upgrades.newProject")}
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{t("upgrades.activeBudget")}</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(activeBudget)}</p>
          {activePaid > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{formatCurrency(activePaid)} {t("upgrades.paidSoFar")}</p>
          )}
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{t("upgrades.activeProjects")}</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{inProgress.length}</p>
          {planned.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{planned.length} {t("upgrades.planned")}</p>
          )}
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">{t("upgrades.invested")}</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(investedTotal)}</p>
          {done.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{done.length} {t("upgrades.done")}</p>
          )}
        </div>
      </div>

      {/* In Progress */}
      {inProgress.length > 0 && (
        <Section title={t("upgrades.inProgress")} count={inProgress.length}>
          {inProgress.map(u => (
            <UpgradeRow
              key={u.id}
              upgrade={u}
              counts={countMap[u.id]}
              isDone={false}
              onDelete={() => { if (confirm("Delete this project and all its data?")) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Planned */}
      {planned.length > 0 && (
        <Section
          title={t("upgrades.planned")}
          count={planned.length}
          extra={
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(planned.reduce((s, u) => s + u.budget, 0))} {t("upgrades.activeBudget").toLowerCase()}
            </p>
          }
        >
          {planned.map(u => (
            <UpgradeRow
              key={u.id}
              upgrade={u}
              counts={countMap[u.id]}
              isDone={false}
              onDelete={() => { if (confirm("Delete this project and all its data?")) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Done */}
      {done.length > 0 && (
        <Section
          title={t("upgrades.done")}
          count={done.length}
          extra={
            doneTotalInvestment > 0
              ? <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(doneTotalInvestment)} {t("upgrades.invested")}</p>
              : undefined
          }
          empty={null}
        >
          {done.map(u => (
            <UpgradeRow
              key={u.id}
              upgrade={u}
              counts={countMap[u.id]}
              isDone={true}
              onDelete={() => { if (confirm("Delete this project and all its data?")) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Show "no active projects" only when there are some upgrades but none active */}
      {inProgress.length === 0 && planned.length === 0 && (
        <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />{t("upgrades.newProject")}
          </Button>
        </div>
      )}

      <AddProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
