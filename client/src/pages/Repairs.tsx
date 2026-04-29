import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Plus, Trash2, Download, Wrench, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types & constants ────────────────────────────────────────────────────────

type Priority = "Low" | "Medium" | "High" | "Critical";
type Phase = "Assessment" | "Quoting" | "Scheduled" | "In Progress" | "Resolved";

const PRIORITY_ORDER: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const PHASE_ORDER: Record<Phase, number> = { "In Progress": 0, Scheduled: 1, Quoting: 2, Assessment: 3, Resolved: 4 };

const PRIORITY_BADGE: Record<Priority, string> = {
  Low:      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Medium:   "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  High:     "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  Critical: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const PHASE_BADGE: Record<Phase, string> = {
  Assessment:  "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Quoting:     "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Scheduled:   "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "In Progress": "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  Resolved:    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

const PRIORITY_ACCENT: Record<Priority, string> = {
  Low:      "border-l-zinc-300 dark:border-l-zinc-600",
  Medium:   "border-l-yellow-400",
  High:     "border-l-orange-400",
  Critical: "border-l-red-500",
};

// ─── Add repair dialog ────────────────────────────────────────────────────────

function AddRepairDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const createMutation = trpc.repairs.create.useMutation({
    onSuccess: () => {
      toast.success("Repair logged");
      utils.repairs.list.invalidate();
      onClose();
    },
    onError: e => toast.error(`Failed to log repair: ${e.message}`),
  });

  const blank = {
    label: "",
    description: "",
    priority: "Medium" as Priority,
    dateLogged: new Date().toISOString().split("T")[0],
  };
  const [f, setF] = useState(blank);

  useEffect(() => { if (!open) setF(blank); }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      label: f.label,
      description: f.description || undefined,
      priority: f.priority,
      status: "Pending",
      phase: "Assessment",
      dateLogged: f.dateLogged,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log repair</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Description *</Label>
            <Input
              id="label"
              required
              placeholder="e.g. Leaking kitchen faucet"
              value={f.label}
              onChange={e => setF({ ...f, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Details</Label>
            <Textarea
              id="description"
              rows={2}
              placeholder="Additional context"
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority *</Label>
              <Select value={f.priority} onValueChange={(v: any) => setF({ ...f, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Critical", "High", "Medium", "Low"] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date logged</Label>
              <Input
                type="date"
                value={f.dateLogged}
                onChange={e => setF({ ...f, dateLogged: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Add contractor quotes, photos, and track payments inside the repair.
          </p>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Log repair
          </Button>
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
  repair: any;
  quoteCounts?: { total: number; hasSelected: boolean };
  isDone: boolean;
  onDelete: () => void;
  onClick: () => void;
}) {
  const phase: Phase = (repair.phase as Phase) || "Assessment";
  const priority: Priority = (repair.priority as Priority) || "Medium";

  return (
    <div
      className={cn(
        "flex items-start gap-4 pl-3 pr-4 py-3.5 border-l-2 hover:bg-muted/30 transition-colors cursor-pointer",
        PRIORITY_ACCENT[priority],
        isDone && "opacity-70",
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-medium", isDone && "text-muted-foreground")}>{repair.label}</p>
          <Badge className={cn("text-xs h-5 border-0 shrink-0", PHASE_BADGE[phase])}>{phase}</Badge>
          <Badge className={cn("text-xs h-5 border-0 shrink-0", PRIORITY_BADGE[priority])}>{priority}</Badge>
        </div>

        {/* Description */}
        {repair.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{repair.description}</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{formatDate(repair.dateLogged)}</span>
          {repair.contractor && (
            <span className="text-xs text-muted-foreground">{repair.contractor}</span>
          )}
          {quoteCounts && quoteCounts.total > 0 ? (
            <span className={cn(
              "flex items-center gap-1 text-xs font-medium",
              quoteCounts.hasSelected
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400",
            )}>
              {quoteCounts.hasSelected
                ? <CheckCircle2 className="h-3 w-3" />
                : <AlertTriangle className="h-3 w-3" />}
              {quoteCounts.total} quote{quoteCounts.total !== 1 ? "s" : ""}
              {quoteCounts.hasSelected ? " · selected" : " · none selected"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/60">No quotes yet</span>
          )}
        </div>

        {/* Cost summary if available */}
        {!isDone && repair.estimatedCost != null && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            Est: {formatCurrency(repair.estimatedCost)}
            {repair.actualCost != null && ` · Paid: ${formatCurrency(repair.actualCost)}`}
          </p>
        )}
        {isDone && repair.actualCost != null && (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {formatCurrency(repair.actualCost)} total cost
          </p>
        )}
      </div>

      {/* Delete button */}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete repair"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  title, count, extra, children,
}: {
  title: string; count: number; extra?: React.ReactNode; children: React.ReactNode;
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
      {count > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Repairs() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: repairs = [], isLoading } = trpc.repairs.list.useQuery();

  const repairIds = repairs.map((r: any) => r.id);
  const { data: rawCounts = [] } = trpc.repairQuotes.countByRepair.useQuery(
    { repairIds },
    { enabled: repairIds.length > 0 },
  );
  const countMap = Object.fromEntries(rawCounts.map(c => [c.repairId, c]));

  const deleteMutation = trpc.repairs.delete.useMutation({
    onSuccess: () => { toast.success("Repair deleted"); utils.repairs.list.invalidate(); },
    onError: e => toast.error(`Failed to delete: ${e.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);

  const handleExportCSV = () => {
    if (!repairs.length) { toast.error("Nothing to export"); return; }
    const headers = ["Description", "Phase", "Priority", "Date", "Contractor", "Est Cost", "Actual Cost", "Notes"];
    const rows = (repairs as any[]).map(r => [
      r.label, r.phase || "Assessment", r.priority, r.dateLogged,
      r.contractor || "",
      r.estimatedCost != null ? (r.estimatedCost / 100).toFixed(2) : "",
      r.actualCost != null ? (r.actualCost / 100).toFixed(2) : "",
      r.notes || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `repairs_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("Exported to CSV");
  };

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  // ── Sections ─────────────────────────────────────────────────────────────────
  const open = (repairs as any[])
    .filter(r => (r.phase || "Assessment") !== "Resolved")
    .sort((a, b) => {
      const pA = PRIORITY_ORDER[(a.priority as Priority)] ?? 2;
      const pB = PRIORITY_ORDER[(b.priority as Priority)] ?? 2;
      if (pA !== pB) return pA - pB;
      return (PHASE_ORDER[(a.phase as Phase)] ?? 3) - (PHASE_ORDER[(b.phase as Phase)] ?? 3);
    });

  const resolved = (repairs as any[])
    .filter(r => (r.phase || "Assessment") === "Resolved")
    .sort((a, b) => b.dateLogged.localeCompare(a.dateLogged));

  const criticalCount = open.filter(r => r.priority === "Critical").length;
  const totalCost = resolved.reduce((s: number, r: any) => s + (r.actualCost ?? 0), 0);

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!repairs.length) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Repairs</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Log repair
          </Button>
        </div>

        <div className="border border-dashed border-border rounded-xl p-10 text-center space-y-4">
          <div className="flex justify-center text-muted-foreground/40">
            <Wrench className="h-10 w-10" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Track repairs end-to-end</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Log an issue, collect contractor quotes, track payments and photos — all linked to your property.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Log first repair
          </Button>
        </div>

        <AddRepairDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Repairs</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={handleExportCSV} title="Export CSV">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Log repair
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{open.length}</p>
          {criticalCount > 0 && (
            <p className="text-xs text-red-500 font-medium mt-0.5">{criticalCount} critical</p>
          )}
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">In progress</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            {open.filter(r => r.phase === "In Progress" || r.phase === "Scheduled").length}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Resolved</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{resolved.length}</p>
          {totalCost > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{formatCurrency(totalCost)} spent</p>
          )}
        </div>
      </div>

      {/* Open */}
      {open.length > 0 && (
        <Section title="Open" count={open.length}>
          {open.map(r => (
            <RepairRow
              key={r.id}
              repair={r}
              quoteCounts={countMap[r.id]}
              isDone={false}
              onDelete={() => { if (confirm("Delete this repair and all its data?")) deleteMutation.mutate({ id: r.id }); }}
              onClick={() => navigate(`/repairs/${r.id}`)}
            />
          ))}
        </Section>
      )}

      {/* Empty open */}
      {open.length === 0 && resolved.length > 0 && (
        <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No open repairs</p>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Log repair
          </Button>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <Section
          title="Resolved"
          count={resolved.length}
          extra={
            totalCost > 0
              ? <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(totalCost)} total</p>
              : undefined
          }
        >
          {resolved.map(r => (
            <RepairRow
              key={r.id}
              repair={r}
              quoteCounts={countMap[r.id]}
              isDone={true}
              onDelete={() => { if (confirm("Delete this repair and all its data?")) deleteMutation.mutate({ id: r.id }); }}
              onClick={() => navigate(`/repairs/${r.id}`)}
            />
          ))}
        </Section>
      )}

      <AddRepairDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
