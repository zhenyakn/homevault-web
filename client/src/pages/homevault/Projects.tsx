import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Upgrade = RouterOutputs["upgrades"]["list"][number];

import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Plus,
  Trash2,
  Download,
  Hammer,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  FolderOpen,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  HVCard,
  MetricCard,
  StatusPill,
  type StatusTone,
} from "@/components/homevault";

// ─── Add project dialog (mirrors the classic page) ─────────────────────────────

function AddProjectDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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

  const blank = { title: "", description: "", estimatedCost: "", notes: "" };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (!open) setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: f.title,
      description: f.description || undefined,
      status: "planning",
      estimatedCost: Math.round(parseFloat(f.estimatedCost) * 100),
      notes: f.notes || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("upgrades.newProject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("upgradeDetail.projectName")}</Label>
            <Input
              id="title"
              required
              placeholder={t("upgrades.placeholderName")}
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("common.description")}</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder={t("upgrades.placeholderDesc")}
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimatedCost">
              {t("upgradeDetail.budgetField")}
            </Label>
            <Input
              id="estimatedCost"
              type="number"
              step="0.01"
              required
              placeholder="0"
              value={f.estimatedCost}
              onChange={e => setF({ ...f, estimatedCost: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("upgrades.budgetHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea
              id="notes"
              rows={2}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {t("upgrades.createProject")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project card ──────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, StatusTone> = {
  planning: "neutral",
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
};

function ProjectCard({
  upgrade,
  counts,
  onDelete,
  onClick,
}: {
  upgrade: Upgrade;
  counts?: { total: number; done: number; needsAction: number };
  onDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const status = (upgrade.status as string) || "planning";
  const isDone = status === "completed" || status === "cancelled";
  const spent = upgrade.actualCost ?? 0;
  const budget = upgrade.estimatedCost ?? 0;
  const remaining = Math.max(0, budget - spent);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const over = spent > budget && budget > 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col gap-3 rounded-[var(--hv-radius-lg)] border border-hv-border bg-hv-surface p-4 shadow-[var(--hv-shadow-card)] transition-colors hover:border-hv-primary/30",
        isDone && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-hv-ink">
            {upgrade.title}
          </p>
          {upgrade.description && (
            <p className="mt-0.5 truncate text-[12px] text-hv-muted">
              {upgrade.description}
            </p>
          )}
        </div>
        <StatusPill tone={STATUS_TONE[status] ?? "neutral"}>
          {t(`status.${status}`, { defaultValue: status })}
        </StatusPill>
      </div>

      {/* Item counts */}
      {counts && counts.total > 0 && (
        <div className="flex items-center gap-3 text-[11.5px]">
          <span className="tabular-nums text-hv-muted">
            {counts.done}/{counts.total} {t("dashboard.itemsDone")}
          </span>
          {counts.needsAction > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-hv-orange">
              <AlertTriangle className="h-3 w-3" />
              {counts.needsAction} {t("dashboard.needAction")}
            </span>
          )}
          {isDone && counts.done === counts.total && (
            <span className="inline-flex items-center gap-1 text-hv-primary">
              <CheckCircle2 className="h-3 w-3" />
              {t("dashboard.allComplete")}
            </span>
          )}
        </div>
      )}

      {/* Budget */}
      <div>
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="font-semibold tabular-nums text-hv-ink">
            {formatCurrency(spent)}
            <span className="font-normal text-hv-muted-soft">
              {" "}
              / {formatCurrency(budget)}
            </span>
          </span>
          <span
            className={cn(
              "tabular-nums",
              over ? "font-medium text-hv-red" : "text-hv-muted"
            )}
          >
            {over
              ? t("dashboard.overBudget")
              : `${formatCurrency(remaining)} ${t("dashboard.remaining")}`}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hv-surface-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct >= 100
                ? "bg-hv-red"
                : pct >= 80
                  ? "bg-hv-orange"
                  : "bg-hv-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Footer: delete */}
      <div className="flex justify-end" onClick={e => e.stopPropagation()}>
        <button
          onClick={onDelete}
          title={t("upgrades.deleteTitle")}
          className="rounded-md p-1.5 text-hv-muted-soft opacity-0 transition-opacity hover:bg-hv-danger-bg hover:text-hv-red group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center gap-2 px-1">
        <h2 className="text-[15px] font-bold tracking-tight text-hv-ink">
          {title}
        </h2>
        <span className="text-[13px] font-medium text-hv-muted-soft">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function HVProjects() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: upgrades = [], isLoading } = trpc.upgrades.list.useQuery();

  const upgradeIds = upgrades.map(u => u.id);
  const { data: rawCounts = [] } = trpc.upgradeItems.countByUpgrade.useQuery(
    { upgradeIds },
    { enabled: upgradeIds.length > 0 }
  );
  const countMap = Object.fromEntries(rawCounts.map(c => [c.upgradeId, c]));

  const deleteMutation = trpc.upgrades.delete.useMutation({
    onSuccess: () => {
      toast.success(t("upgrades.projectDeleted"));
      utils.upgrades.list.invalidate();
    },
    onError: e => toast.error(`${t("upgrades.failedDeleteMsg")}: ${e.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleExportCSV = () => {
    if (!upgrades.length) {
      toast.error(t("upgrades.nothingToExport"));
      return;
    }
    const headers = ["Name", "Status", "Budget", "Paid", "Remaining", "Notes"];
    const rows = upgrades.map(u => [
      u.title,
      u.status || "planning",
      ((u.estimatedCost ?? 0) / 100).toFixed(2),
      ((u.actualCost || 0) / 100).toFixed(2),
      (((u.estimatedCost ?? 0) - (u.actualCost || 0)) / 100).toFixed(2),
      u.notes || "",
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `projects_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success(t("upgrades.exported"));
  };

  const del = (u: Upgrade) => {
    if (confirm(t("upgrades.deleteConfirm")))
      deleteMutation.mutate({ id: u.id });
  };

  if (isLoading)
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
      </div>
    );

  const inProgress = upgrades
    .filter(u => u.status === "in_progress")
    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  const planned = upgrades
    .filter(u => u.status === "planning")
    .sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0));
  const done = upgrades.filter(u => u.status === "completed");

  const activeBudget = inProgress.reduce(
    (s, u) => s + (u.estimatedCost ?? 0),
    0
  );
  const investedTotal = done.reduce((s, u) => s + (u.actualCost ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-hv-ink">
            {t("nav.projects")}
          </h1>
          <p className="mt-1.5 text-[14px] text-hv-muted">
            {t("homevault.projectsSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="me-1.5 h-3.5 w-3.5" />
            {t("common.exportCsv")}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="me-1.5 h-3.5 w-3.5" />
            {t("upgrades.newProject")}
          </Button>
        </div>
      </div>

      {upgrades.length === 0 ? (
        <HVCard>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hv-primary-soft text-hv-primary">
              <Hammer className="h-6 w-6" />
            </span>
            <p className="text-[14px] font-semibold text-hv-ink">
              {t("upgrades.emptyTitle")}
            </p>
            <p className="max-w-sm text-[12.5px] text-hv-muted">
              {t("upgrades.emptyDesc")}
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t("upgrades.startFirst")}
            </Button>
          </div>
        </HVCard>
      ) : (
        <>
          {/* KPI row */}
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label={t("upgrades.activeBudget")}
              value={formatCurrency(activeBudget)}
            />
            <MetricCard
              label={t("upgrades.activeProjects")}
              value={inProgress.length}
              tone="blue"
              helper={
                planned.length > 0
                  ? `${planned.length} ${t("upgrades.planned")}`
                  : undefined
              }
            />
            <MetricCard
              label={t("upgrades.invested")}
              value={formatCurrency(investedTotal)}
              tone="green"
              helper={
                done.length > 0
                  ? `${done.length} ${t("upgrades.done")}`
                  : undefined
              }
            />
          </div>

          <Section title={t("upgrades.inProgress")} count={inProgress.length}>
            {inProgress.map(u => (
              <ProjectCard
                key={u.id}
                upgrade={u}
                counts={countMap[u.id]}
                onDelete={() => del(u)}
                onClick={() => navigate(`/upgrades/${u.id}`)}
              />
            ))}
          </Section>

          <Section title={t("upgrades.planned")} count={planned.length}>
            {planned.map(u => (
              <ProjectCard
                key={u.id}
                upgrade={u}
                counts={countMap[u.id]}
                onDelete={() => del(u)}
                onClick={() => navigate(`/upgrades/${u.id}`)}
              />
            ))}
          </Section>

          <Section title={t("upgrades.done")} count={done.length}>
            {done.map(u => (
              <ProjectCard
                key={u.id}
                upgrade={u}
                counts={countMap[u.id]}
                onDelete={() => del(u)}
                onClick={() => navigate(`/upgrades/${u.id}`)}
              />
            ))}
          </Section>
        </>
      )}

      <AddProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
