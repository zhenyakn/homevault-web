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

// Backend status enum: idea | planning | in_progress | completed | cancelled
type UpgradeStatus = "idea" | "planning" | "in_progress" | "completed" | "cancelled";

const STATUS_BADGE: Record<string, string> = {
  idea:        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  planning:    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  completed:   "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  cancelled:   "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500",
};

const STATUS_LABEL: Record<string, string> = {
  idea:        "Idea",
  planning:    "Planning",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

function barColor(actual: number, estimated: number) {
  if (estimated === 0) return "bg-primary";
  const pct = actual / estimated;
  if (pct >= 1)   return "bg-red-500";
  if (pct >= 0.8) return "bg-amber-400";
  return "bg-primary";
}

// ─── Add project dialog ───────────────────────────────────────────────────────

function AddProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMutation = trpc.upgrades.create.useMutation({
    onSuccess: () => {
      toast.success(t("upgrades.projectCreated"));
      utils.upgrades.list.invalidate();
      onClose();
    },
    onError: e => toast.error(`${t("upgrades.failedCreate")}: ${e.message}`),
  });

  const blank = { title: "", description: "", estimatedCost: "", notes: "", status: "planning" as UpgradeStatus };
  const [f, setF] = useState(blank);

  useEffect(() => { if (!open) setF(blank); }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: f.title,
      description: f.description || undefined,
      status: f.status,
      estimatedCost: f.estimatedCost ? Math.round(parseFloat(f.estimatedCost) * 100) : undefined,
      notes: f.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("upgrades.newProject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("upgradeDetail.projectName")}</Label>
            <Input
              id="title"
              required
              placeholder={t("upgrades.placeholderName")}
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("common.description")}</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder={t("upgrades.placeholderDesc")}
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={f.status} onValueChange={v => setF({ ...f, status: v as UpgradeStatus })}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimatedCost">{t("upgradeDetail.budgetField")}</Label>
            <Input
              id="estimatedCost"
              type="number"
              step="0.01"
              placeholder="0"
              value={f.estimatedCost}
              onChange={e => setF({ ...f, estimatedCost: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("upgrades.budgetHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("upgrades.createProject")}
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
  const { t } = useTranslation();
  const status: UpgradeStatus = (upgrade.status as UpgradeStatus) || "planning";
  const actual    = upgrade.actualCost ?? 0;
  const estimated = upgrade.estimatedCost ?? 0;
  const progress  = estimated > 0 ? Math.min(100, (actual / estimated) * 100) : 0;

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
          <p className={cn("text-sm font-medium", isDone && "text-muted-foreground")}>{upgrade.title}</p>
          <Badge className={cn("text-xs h-5 border-0 shrink-0", STATUS_BADGE[status])}>
            {STATUS_LABEL[status] ?? status}
          </Badge>
        </div>

        {/* Description */}
        {upgrade.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{upgrade.description}</p>
        )}

        {/* Item counts row */}
        {counts && counts.total > 0 && (
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              {counts.done}/{counts.total} {t("dashboard.itemsDone")}
            </span>
            {counts.needsAction > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {counts.needsAction} {t("dashboard.needAction")}
              </span>
            )}
            {isDone && counts.done === counts.total && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />{t("dashboard.allComplete")}
              </span>
            )}
          </div>
        )}

        {/* Budget bar */}
        {!isDone && estimated > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatCurrency(actual)} {t("dashboard.paid")}
                {actual > estimated && <span className="text-red-500 font-medium ms-1">· {t("dashboard.overBudget")}</span>}
              </span>
              <span className="tabular-nums">{formatCurrency(estimated)} {t("dashboard.envelope")}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className={cn("h-full transition-all rounded-full", barColor(actual, estimated))}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done: show final spend */}
        {isDone && actual > 0 && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {formatCurrency(actual)} {t("dashboard.invested")}
          </p>
        )}
      </div>

      {/* Delete button */}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title={t("upgrades.deleteTitle")}
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
    onSuccess: () => { toast.success(t("upgrades.projectDeleted")); utils.upgrades.list.invalidate(); },
    onError: e => toast.error(`${t("upgrades.failedDeleteMsg")}: ${e.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleExportCSV = () => {
    if (!upgrades.length) { toast.error(t("upgrades.nothingToExport")); return; }
    const headers = ["Name", "Status", "Estimated Cost", "Actual Cost", "Remaining", "Notes"];
    const rows = upgrades.map((u: any) => [
      u.title,
      u.status || "",
      u.estimatedCost != null ? (u.estimatedCost / 100).toFixed(2) : "",
      u.actualCost    != null ? (u.actualCost    / 100).toFixed(2) : "",
      u.estimatedCost != null ? (((u.estimatedCost ?? 0) - (u.actualCost ?? 0)) / 100).toFixed(2) : "",
      u.notes || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `upgrades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success(t("upgrades.exported"));
  };

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  // ── Sections ────────────────────────────────────────────────────────────────
  const inProgress = upgrades.filter(u => u.status === "in_progress");
  const planned    = upgrades.filter(u => u.status === "idea" || u.status === "planning")
                             .sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0));
  const done       = upgrades.filter(u => u.status === "completed" || u.status === "cancelled");

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeBudget    = inProgress.reduce((s, u) => s + (u.estimatedCost ?? 0), 0);
  const activePaid      = inProgress.reduce((s, u) => s + (u.actualCost    ?? 0), 0);
  const investedTotal   = done.reduce((s, u) => s + (u.actualCost ?? 0), 0);

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
              onDelete={() => { if (confirm(t("upgrades.deleteConfirm"))) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Planned / Idea */}
      {planned.length > 0 && (
        <Section
          title={t("upgrades.planned")}
          count={planned.length}
          extra={
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(planned.reduce((s, u) => s + (u.estimatedCost ?? 0), 0))} {t("upgrades.activeBudget").toLowerCase()}
            </p>
          }
        >
          {planned.map(u => (
            <UpgradeRow
              key={u.id}
              upgrade={u}
              counts={countMap[u.id]}
              isDone={false}
              onDelete={() => { if (confirm(t("upgrades.deleteConfirm"))) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Done / Cancelled */}
      {done.length > 0 && (
        <Section
          title={t("upgrades.done")}
          count={done.length}
          extra={
            investedTotal > 0
              ? <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(investedTotal)} {t("upgrades.invested")}</p>
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
              onDelete={() => { if (confirm(t("upgrades.deleteConfirm"))) deleteMutation.mutate({ id: u.id }); }}
              onClick={() => navigate(`/upgrades/${u.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Show "no active projects" only when there are some upgrades but none active/planned */}
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
