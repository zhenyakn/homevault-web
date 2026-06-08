import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Repair = RouterOutputs["repairs"]["list"][number];
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Download,
  Wrench,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { ListSection } from "@/components/ListSection";
import {
  statusBadgeClass,
  priorityBadgeClass,
  priorityAccentClass,
} from "@/lib/badges";

// ─── Sort orders ──────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  waiting_for_parts: 1,
  waiting_for_contractor: 2,
  open: 3,
  cancelled: 4,
};

// ─── Add repair dialog ────────────────────────────────────────────────────────

function AddRepairDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMutation = trpc.repairs.create.useMutation({
    onSuccess: () => {
      toast.success(t("repairs.logRepair"));
      utils.repairs.list.invalidate();
      onClose();
    },
    onError: e => toast.error(`${t("repairs.failedLog")}: ${e.message}`),
  });

  const blank = {
    title: "",
    description: "",
    priority: "medium",
    reportedDate: new Date().toISOString().split("T")[0],
  };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (!open) setF(blank);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: f.title,
      description: f.description || undefined,
      priority: f.priority as Repair["priority"],
      status: "open",
      reportedDate: f.reportedDate,
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
          <DialogTitle>{t("repairs.logRepair")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("repairs.description")} *</Label>
            <Input
              id="title"
              required
              placeholder={t("repairs.placeholderLabel")}
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("repairs.details")}</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder={t("repairs.placeholderContext")}
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("repairs.priority")} *</Label>
              <Select
                value={f.priority}
                onValueChange={v => setF({ ...f, priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["urgent", "high", "medium", "low"].map(p => (
                    <SelectItem key={p} value={p}>
                      {t(`priority.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("repairs.dateLogged")}</Label>
              <Input
                type="date"
                value={f.reportedDate}
                onChange={e => setF({ ...f, reportedDate: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("repairs.addContext")}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {t("repairs.logRepair")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Repair row ───────────────────────────────────────────────────────────────

function RepairRow({
  repair,
  quoteCounts,
  isDone,
  onDelete,
  onClick,
}: {
  repair: Repair;
  quoteCounts?: { total: number; hasSelected: boolean };
  isDone: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const status = (repair.status as string) || "open";
  const priority = (repair.priority as string) || "medium";

  return (
    <div
      className={cn(
        "flex items-start gap-4 ltr:pl-3 ltr:pr-4 rtl:pr-3 rtl:pl-4 py-3.5 ltr:border-l-2 rtl:border-r-2 hover:bg-muted/30 transition-colors cursor-pointer",
        priorityAccentClass(priority),
        isDone && "opacity-70"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={cn(
              "text-sm font-medium",
              isDone && "text-muted-foreground"
            )}
          >
            {repair.title}
          </p>
          <Badge
            className={cn(
              "text-xs h-5 border-0 shrink-0",
              statusBadgeClass(status)
            )}
          >
            {t(`status.${status}`, { defaultValue: status })}
          </Badge>
          <Badge
            className={cn(
              "text-xs h-5 border-0 shrink-0",
              priorityBadgeClass(priority)
            )}
          >
            {t(`priority.${priority}`, { defaultValue: priority })}
          </Badge>
        </div>

        {/* Description */}
        {repair.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {repair.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatDate(repair.reportedDate ?? "")}
          </span>
          {repair.contractor && (
            <span className="text-xs text-muted-foreground">
              {repair.contractor}
            </span>
          )}
          {quoteCounts && quoteCounts.total > 0 ? (
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                quoteCounts.hasSelected
                  ? "text-green-600 dark:text-green-400"
                  : "text-amber-600 dark:text-amber-400"
              )}
            >
              {quoteCounts.hasSelected ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {quoteCounts.total}{" "}
              {quoteCounts.total !== 1
                ? t("repairs.quotes")
                : t("repairs.quote")}
              {quoteCounts.hasSelected
                ? ` ${t("repairs.quotesSelected")}`
                : ` ${t("repairs.quotesNone")}`}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-3 w-3" />
              {t("repairs.noQuotes")}
            </span>
          )}
        </div>

        {/* Cost if available */}
        {repair.cost != null && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {isDone
              ? `${formatCurrency(repair.cost)} ${t("repairs.totalCost")}`
              : `${t("repairs.estCost")}: ${formatCurrency(repair.cost)}`}
          </p>
        )}
      </div>

      {/* Delete button */}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title={t("repairs.deleteTitle")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Repairs() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: repairs = [], isLoading } = trpc.repairs.list.useQuery();

  const repairIds = repairs.map(r => r.id);
  const { data: rawCounts = [] } = trpc.repairQuotes.countByRepair.useQuery(
    { repairIds },
    { enabled: repairIds.length > 0 }
  );
  const countMap = Object.fromEntries(rawCounts.map(c => [c.repairId, c]));

  const deleteMutation = trpc.repairs.delete.useMutation({
    onSuccess: () => {
      toast.success(t("repairs.deleted"));
      utils.repairs.list.invalidate();
    },
    onError: e => toast.error(`${t("repairs.failedDeleteMsg")}: ${e.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleExportCSV = () => {
    if (!repairs.length) {
      toast.error(t("repairs.nothingToExport"));
      return;
    }
    const headers = [
      "Description",
      "Status",
      "Priority",
      "Date",
      "Contractor",
      "Cost",
      "Notes",
    ];
    const rows = repairs.map(r => [
      r.title,
      r.status || "open",
      r.priority || "medium",
      r.reportedDate || "",
      r.contractor || "",
      r.cost != null ? (r.cost / 100).toFixed(2) : "",
      r.notes || "",
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `repairs_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success(t("repairs.exported"));
  };

  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );

  // ── Sections ─────────────────────────────────────────────────────────────────
  const openRepairs = repairs
    .filter(r => r.status !== "completed" && r.status !== "cancelled")
    .sort((a, b) => {
      const pA = PRIORITY_ORDER[a.priority ?? ""] ?? 2;
      const pB = PRIORITY_ORDER[b.priority ?? ""] ?? 2;
      if (pA !== pB) return pA - pB;
      return (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
    });

  const resolved = repairs
    .filter(r => r.status === "completed" || r.status === "cancelled")
    .sort((a, b) => (b.reportedDate ?? "").localeCompare(a.reportedDate ?? ""));

  const urgentCount = openRepairs.filter(r => r.priority === "urgent").length;
  const activeCount = openRepairs.filter(
    r =>
      r.status === "in_progress" ||
      r.status === "waiting_for_parts" ||
      r.status === "waiting_for_contractor"
  ).length;
  const totalCost = resolved.reduce((s, r) => s + (r.cost ?? 0), 0);

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!repairs.length) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("repairs.title")}</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("repairs.logRepair")}
          </Button>
        </div>

        <div className="border border-dashed border-border rounded-xl p-10 text-center space-y-4">
          <div className="flex justify-center text-muted-foreground/40">
            <Wrench className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("repairs.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {t("repairs.emptyDesc")}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("repairs.logFirst")}
          </Button>
        </div>

        <AddRepairDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("repairs.title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={handleExportCSV}
            title={t("common.exportCsv")}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("repairs.logRepair")}
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("repairs.statOpen")}
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {openRepairs.length}
          </p>
          {urgentCount > 0 && (
            <p className="text-xs text-red-500 font-medium mt-0.5">
              {urgentCount} {t("priority.urgent")}
            </p>
          )}
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("repairs.statInProgress")}
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {activeCount}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">
            {t("repairs.statResolved")}
          </p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {resolved.length}
          </p>
          {totalCost > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {formatCurrency(totalCost)} {t("dashboard.spent")}
            </p>
          )}
        </div>
      </div>

      {/* Open */}
      {openRepairs.length > 0 && (
        <ListSection title={t("repairs.active")} count={openRepairs.length}>
          {openRepairs.map(r => (
            <RepairRow
              key={r.id}
              repair={r}
              quoteCounts={countMap[r.id]}
              isDone={false}
              onDelete={() => setDeletingId(r.id)}
              onClick={() => navigate(`/repairs/${r.id}`)}
            />
          ))}
        </ListSection>
      )}

      {/* Empty open */}
      {openRepairs.length === 0 && resolved.length > 0 && (
        <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">{t("repairs.noOpen")}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 me-1.5" />
            {t("repairs.logRepair")}
          </Button>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <ListSection
          title={t("repairs.resolved")}
          count={resolved.length}
          extra={
            totalCost > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCurrency(totalCost)} {t("common.total")}
              </p>
            ) : undefined
          }
        >
          {resolved.map(r => (
            <RepairRow
              key={r.id}
              repair={r}
              quoteCounts={countMap[r.id]}
              isDone={true}
              onDelete={() => setDeletingId(r.id)}
              onClick={() => navigate(`/repairs/${r.id}`)}
            />
          ))}
        </ListSection>
      )}

      <AddRepairDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={open => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("repairs.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("repairs.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingId) deleteMutation.mutate({ id: deletingId });
                setDeletingId(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
