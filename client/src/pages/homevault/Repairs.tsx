import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Repair = RouterOutputs["repairs"]["list"][number];

import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus, Download, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  HVCard,
  RepairCard,
  HVPageHeader,
  type RepairStatus,
  type RepairPriority,
} from "@/components/homevault";

// ─── Add repair dialog (mirrors the classic Repairs page) ──────────────────────

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {t("repairs.logRepair")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status mapping ────────────────────────────────────────────────────────────

function boardColumn(status: string): RepairStatus {
  if (status === "completed" || status === "cancelled") return "done";
  if (status === "waiting_for_parts" || status === "waiting_for_contractor")
    return "waiting";
  return "open";
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function HVRepairs() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: repairs = [], isLoading } = trpc.repairs.list.useQuery();

  const repairIds = repairs.map(r => r.id);
  const { data: rawCounts = [] } = trpc.repairQuotes.countByRepair.useQuery(
    { repairIds },
    { enabled: repairIds.length > 0 }
  );
  const countMap = Object.fromEntries(rawCounts.map(c => [c.repairId, c]));

  const [dialogOpen, setDialogOpen] = useState(false);

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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `repairs_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success(t("repairs.exported"));
  };

  if (isLoading)
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
      </div>
    );

  const sortByPriority = (a: Repair, b: Repair) =>
    (PRIORITY_ORDER[a.priority ?? ""] ?? 2) -
    (PRIORITY_ORDER[b.priority ?? ""] ?? 2);

  const columns: { key: RepairStatus; label: string; items: Repair[] }[] = [
    {
      key: "open",
      label: t("homevault.repairBoard.open"),
      items: repairs
        .filter(r => boardColumn(r.status) === "open")
        .sort(sortByPriority),
    },
    {
      key: "waiting",
      label: t("homevault.repairBoard.waiting"),
      items: repairs
        .filter(r => boardColumn(r.status) === "waiting")
        .sort(sortByPriority),
    },
    {
      key: "done",
      label: t("homevault.repairBoard.done"),
      items: repairs
        .filter(r => boardColumn(r.status) === "done")
        .sort((a, b) =>
          (b.reportedDate ?? "").localeCompare(a.reportedDate ?? "")
        ),
    },
  ];

  const nextStepFor = (r: Repair) => {
    const counts = countMap[r.id];
    if (counts && counts.total > 0 && !counts.hasSelected)
      return t("dashboard.quotesReceived");
    return t(`status.${r.status}`, { defaultValue: r.status });
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <HVPageHeader
        title={t("homevault.repairsTitle")}
        subtitle={t("homevault.repairsSubtitle")}
        hideQuickAdd
        actions={
          <>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="h-11 rounded-full px-[18px]"
            >
              <Download className="me-1.5 h-3.5 w-3.5" />
              {t("common.exportCsv")}
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              className="h-11 rounded-full px-[18px]"
            >
              <Plus className="me-1.5 h-4 w-4" />
              {t("repairs.logRepair")}
            </Button>
          </>
        }
      />

      {repairs.length === 0 ? (
        <HVCard>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hv-primary-soft text-hv-primary">
              <Wrench className="h-6 w-6" />
            </span>
            <p className="text-[14px] font-semibold text-hv-ink">
              {t("repairs.emptyTitle")}
            </p>
            <p className="max-w-sm text-[12.5px] text-hv-muted">
              {t("repairs.emptyDesc")}
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t("repairs.logFirst")}
            </Button>
          </div>
        </HVCard>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {columns.map(col => (
            <div
              key={col.key}
              className="rounded-[18px] border border-hv-border bg-hv-surface-muted p-3.5"
            >
              <div className="mb-3 flex items-center gap-2 px-0.5">
                <h2 className="text-[15px] font-bold tracking-tight text-hv-ink">
                  {col.label}
                </h2>
                <span className="text-[13px] font-medium text-hv-muted-soft">
                  {col.items.length}
                </span>
              </div>
              <div className="space-y-3">
                {col.items.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-hv-border px-3 py-6 text-center text-[12px] text-hv-muted-soft">
                    {t("homevault.repairBoard.empty")}
                  </div>
                ) : (
                  col.items.map(r => (
                    <RepairCard
                      key={r.id}
                      title={r.title}
                      priority={(r.priority ?? "medium") as RepairPriority}
                      status={col.key}
                      estimate={
                        r.cost != null ? formatCurrency(r.cost) : undefined
                      }
                      nextStep={nextStepFor(r)}
                      contractor={r.contractor ?? undefined}
                      onClick={() => navigate(`/repairs/${r.id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddRepairDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
