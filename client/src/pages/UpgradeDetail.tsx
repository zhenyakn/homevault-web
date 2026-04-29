import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, ChevronDown, ChevronUp, Phone,
  Check, Pencil, Trash2, CreditCard, Loader2, Package,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = "Need to find" | "Researching" | "Quoted" | "Ordered" | "Delivered" | "Installed";
const ITEM_STATUSES: ItemStatus[] = ["Need to find", "Researching", "Quoted", "Ordered", "Delivered", "Installed"];
const PHASES = ["Planning", "Sourcing", "Building", "Done"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: ItemStatus) {
  const map: Record<ItemStatus, string> = {
    "Need to find": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    "Researching":  "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    "Quoted":       "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    "Ordered":      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
    "Delivered":    "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
    "Installed":    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  };
  return <Badge className={cn("text-xs border-0 h-5", map[status])}>{status}</Badge>;
}

function itemGroupOf(status: ItemStatus) {
  if (["Need to find", "Researching", "Quoted"].includes(status)) return "action";
  if (status === "Ordered") return "ordered";
  return "done";
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function AddOptionDialog({ upgradeId, open, onClose }: { upgradeId: string; open: boolean; onClose: () => void }) {
  const u = trpc.useUtils();
  const mut = trpc.upgradeOptions.create.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); onClose(); toast.success("Option added"); },
    onError: e => toast.error(e.message),
  });
  const [f, setF] = useState({ name: "", vendorPhone: "", totalPrice: "", timeline: "", warranty: "", scope: "", notes: "" });
  const reset = () => setF({ name: "", vendorPhone: "", totalPrice: "", timeline: "", warranty: "", scope: "", notes: "" });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add option / quote</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>Vendor / option name *</Label>
            <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. IKEA + Rami Installation" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Total price</Label>
              <Input type="number" value={f.totalPrice} onChange={e => setF({ ...f, totalPrice: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1"><Label>Phone</Label>
              <Input value={f.vendorPhone} onChange={e => setF({ ...f, vendorPhone: e.target.value })} placeholder="05x-xxx-xxxx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Timeline</Label>
              <Input value={f.timeline} onChange={e => setF({ ...f, timeline: e.target.value })} placeholder="e.g. 8 weeks" />
            </div>
            <div className="space-y-1"><Label>Warranty</Label>
              <Input value={f.warranty} onChange={e => setF({ ...f, warranty: e.target.value })} placeholder="e.g. 1 year" />
            </div>
          </div>
          <div className="space-y-1"><Label>What's included</Label>
            <Textarea rows={2} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} placeholder="Cabinets, installation, countertop…" />
          </div>
          <div className="space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!f.name || mut.isPending} onClick={() => mut.mutate({
            upgradeId, name: f.name,
            vendorPhone: f.vendorPhone || undefined,
            totalPrice: f.totalPrice ? Math.round(parseFloat(f.totalPrice) * 100) : undefined,
            timeline: f.timeline || undefined,
            warranty: f.warranty || undefined,
            scope: f.scope || undefined,
            notes: f.notes || undefined,
          })}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add option
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ upgradeId, open, onClose, editItem }: { upgradeId: string; open: boolean; onClose: () => void; editItem?: any }) {
  const u = trpc.useUtils();
  const create = trpc.upgradeItems.create.useMutation({
    onSuccess: () => { u.upgradeItems.list.invalidate({ upgradeId }); onClose(); toast.success("Item added"); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.upgradeItems.update.useMutation({
    onSuccess: () => { u.upgradeItems.list.invalidate({ upgradeId }); onClose(); toast.success("Item updated"); },
    onError: e => toast.error(e.message),
  });

  const [f, setF] = useState(() => editItem ? {
    name: editItem.name,
    vendorName: editItem.vendorName || "",
    estimatedCost: editItem.estimatedCost ? String(editItem.estimatedCost / 100) : "",
    actualCost: editItem.actualCost ? String(editItem.actualCost / 100) : "",
    status: editItem.status as ItemStatus,
    eta: editItem.eta || "",
    notes: editItem.notes || "",
  } : { name: "", vendorName: "", estimatedCost: "", actualCost: "", status: "Need to find" as ItemStatus, eta: "", notes: "" });

  const submit = () => {
    const payload = {
      name: f.name,
      vendorName: f.vendorName || undefined,
      estimatedCost: f.estimatedCost ? Math.round(parseFloat(f.estimatedCost) * 100) : undefined,
      actualCost: f.actualCost ? Math.round(parseFloat(f.actualCost) * 100) : undefined,
      status: f.status,
      eta: f.eta || undefined,
      notes: f.notes || undefined,
    };
    if (editItem) update.mutate({ id: editItem.id, data: payload });
    else create.mutate({ upgradeId, ...payload });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editItem ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>Item name *</Label>
            <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Undermount sink (Franke)" />
          </div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={f.status} onValueChange={v => setF({ ...f, status: v as ItemStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Est. cost (₪)</Label>
              <Input type="number" value={f.estimatedCost} onChange={e => setF({ ...f, estimatedCost: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1"><Label>Actual cost (₪)</Label>
              <Input type="number" value={f.actualCost} onChange={e => setF({ ...f, actualCost: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Vendor / store</Label>
              <Input value={f.vendorName} onChange={e => setF({ ...f, vendorName: e.target.value })} placeholder="IKEA, Amazon…" />
            </div>
            <div className="space-y-1"><Label>ETA</Label>
              <Input type="date" value={f.eta} onChange={e => setF({ ...f, eta: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1"><Label>Notes</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!f.name || create.isPending || update.isPending} onClick={submit}>
            {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editItem ? "Save changes" : "Add item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogPaymentDialog({ optionId, optionName, open, onClose, upgradeId }: { optionId: string; optionName: string; open: boolean; onClose: () => void; upgradeId: string }) {
  const u = trpc.useUtils();
  const mut = trpc.upgradeOptions.logPayment.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); onClose(); toast.success("Payment logged"); },
    onError: e => toast.error(e.message),
  });
  const [f, setF] = useState({ amount: "", date: new Date().toISOString().split("T")[0], notes: "" });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Log payment — {optionName}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>Amount (₪) *</Label>
            <Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="0" autoFocus />
          </div>
          <div className="space-y-1"><Label>Date</Label>
            <Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="space-y-1"><Label>Notes</Label>
            <Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. deposit payment" />
          </div>
          <Button className="w-full" disabled={!f.amount || mut.isPending} onClick={() => mut.mutate({
            optionId, date: f.date, amount: Math.round(parseFloat(f.amount) * 100), notes: f.notes || undefined,
          })}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Option Card ──────────────────────────────────────────────────────────────

function OptionCard({ option, upgradeId, onLogPayment }: { option: any; upgradeId: string; onLogPayment: () => void }) {
  const u = trpc.useUtils();
  const [expanded, setExpanded] = useState(option.isSelected);
  const selectMut = trpc.upgradeOptions.select.useMutation({
    onSuccess: () => u.upgradeOptions.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.upgradeOptions.delete.useMutation({
    onSuccess: () => u.upgradeOptions.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });

  const paid = ((option.payments || []) as any[]).reduce((s: number, p: any) => s + p.amount, 0);

  return (
    <div className={cn("border rounded-xl overflow-hidden transition-colors", option.isSelected ? "border-primary" : "border-border")}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{option.name}</span>
            {option.isSelected && <Badge className="bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-0 text-xs h-5">Selected ✓</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {option.totalPrice ? formatCurrency(option.totalPrice) : "No price"}{option.timeline ? ` · ${option.timeline}` : ""}
            {option.warranty ? ` · ${option.warranty} warranty` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {/* Phone + paid bar for selected */}
          {option.isSelected && (
            <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-border">
              {option.vendorPhone ? (
                <a href={`tel:${option.vendorPhone}`} className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Phone className="h-3.5 w-3.5" />{option.vendorPhone}
                </a>
              ) : <span className="text-xs text-muted-foreground">No phone</span>}
              <span className="text-xs text-muted-foreground tabular-nums">
                Paid: <span className="text-foreground font-semibold">{formatCurrency(paid)}</span>
                {option.totalPrice ? ` / ${formatCurrency(option.totalPrice)}` : ""}
              </span>
            </div>
          )}

          <div className="px-4 py-3 space-y-3">
            {option.vendorPhone && !option.isSelected && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />{option.vendorPhone}
              </p>
            )}
            {option.scope && <p className="text-xs text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">Scope: </span>{option.scope}</p>}
            {option.notes && <p className="text-xs text-muted-foreground leading-relaxed">{option.notes}</p>}

            {/* Payments history */}
            {option.isSelected && (option.payments || []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Payments</p>
                {(option.payments as any[]).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{p.date}{p.notes ? ` · ${p.notes}` : ""}</span>
                    <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {!option.isSelected && (
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={selectMut.isPending}
                  onClick={() => selectMut.mutate({ upgradeId, optionId: option.id })}>
                  <Check className="h-3 w-3 mr-1" />Select this
                </Button>
              )}
              {option.isSelected && (
                <Button size="sm" className="h-7 text-xs" onClick={onLogPayment}>
                  <CreditCard className="h-3 w-3 mr-1" />Log payment
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => { if (confirm("Delete this option?")) deleteMut.mutate({ id: option.id }); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, upgradeId, onEdit }: { item: any; upgradeId: string; onEdit: () => void }) {
  const u = trpc.useUtils();
  const updateMut = trpc.upgradeItems.update.useMutation({ onSuccess: () => u.upgradeItems.list.invalidate({ upgradeId }) });
  const deleteMut = trpc.upgradeItems.delete.useMutation({ onSuccess: () => u.upgradeItems.list.invalidate({ upgradeId }) });

  const isDone = ["Delivered", "Installed"].includes(item.status);
  const nextStatus: Record<ItemStatus, ItemStatus> = {
    "Need to find": "Researching", "Researching": "Quoted", "Quoted": "Ordered",
    "Ordered": "Delivered", "Delivered": "Installed", "Installed": "Installed",
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 group">
      {/* Status dot — click to advance */}
      <button
        className={cn(
          "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
          isDone ? "bg-primary border-primary text-primary-foreground" :
          item.status === "Ordered" ? "border-blue-400" :
          ["Researching", "Quoted"].includes(item.status) ? "border-amber-400" : "border-border"
        )}
        onClick={() => !isDone && updateMut.mutate({ id: item.id, data: { status: nextStatus[item.status as ItemStatus] } })}
        title={isDone ? "Done" : `Advance to ${nextStatus[item.status as ItemStatus]}`}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug", isDone && "text-muted-foreground line-through")}>{item.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          {item.vendorName && <span>{item.vendorName}</span>}
          {item.eta && <span>ETA {item.eta}</span>}
          {item.notes && <span className="truncate max-w-[180px]">{item.notes}</span>}
        </p>
      </div>

      {/* Right: cost + status + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className={cn("text-sm font-semibold tabular-nums", isDone && "text-muted-foreground")}>
            {item.actualCost ? formatCurrency(item.actualCost) : item.estimatedCost ? formatCurrency(item.estimatedCost) : "—"}
          </p>
          <div className="mt-0.5">{statusBadge(item.status)}</div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => deleteMut.mutate({ id: item.id })}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UpgradeDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const upgradeId = params.id;

  const u = trpc.useUtils();
  const { data: upgrades, isLoading: loadingUpgrade } = trpc.upgrades.list.useQuery();
  const { data: options = [], isLoading: loadingOptions } = trpc.upgradeOptions.list.useQuery({ upgradeId });
  const { data: items = [], isLoading: loadingItems } = trpc.upgradeItems.list.useQuery({ upgradeId });

  const upgrade = upgrades?.find(u => u.id === upgradeId);

  const updateUpgrade = trpc.upgrades.update.useMutation({
    onSuccess: () => u.upgrades.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const [addOptionOpen, setAddOptionOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [paymentFor, setPaymentFor] = useState<any>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  if (loadingUpgrade) return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!upgrade) return <div className="p-6 text-center text-muted-foreground">Upgrade not found. <button className="underline" onClick={() => navigate("/upgrades")}>Go back</button></div>;

  const selectedOption = options.find((o: any) => o.isSelected);
  const committed = selectedOption?.totalPrice || 0;
  const paid = ((selectedOption?.payments || []) as any[]).reduce((s: number, p: any) => s + p.amount, 0);
  const progress = upgrade.budget > 0 ? Math.min(100, (upgrade.spent / upgrade.budget) * 100) : 0;

  const needsAction = items.filter((i: any) => ["Need to find", "Researching", "Quoted"].includes(i.status));
  const orderedItems = items.filter((i: any) => i.status === "Ordered");
  const doneItems = items.filter((i: any) => ["Delivered", "Installed"].includes(i.status));

  const phaseIdx = PHASES.indexOf((upgrade as any).phase || "Planning");

  return (
    <div className="max-w-2xl mx-auto space-y-0 pb-10">

      {/* Back */}
      <div className="flex items-center justify-between py-2">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2" onClick={() => navigate("/upgrades")}>
          <ArrowLeft className="h-4 w-4" />Upgrades
        </Button>
      </div>

      {/* Hero */}
      <div className="pb-4">
        <h1 className="text-xl font-bold tracking-tight">{upgrade.label}</h1>
        {upgrade.description && <p className="text-sm text-muted-foreground mt-1">{upgrade.description}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge className={cn("border-0 text-xs", upgrade.status === "Done" ? "bg-green-50 text-green-700" : upgrade.status === "In Progress" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-600")}>
            {upgrade.status}
          </Badge>
        </div>
      </div>

      {/* Phase stepper */}
      <div className="flex items-center mb-5">
        {PHASES.map((phase, idx) => (
          <div key={phase} className="flex items-center flex-1 last:flex-none">
            <button
              className="flex flex-col items-center gap-1 group"
              onClick={() => updateUpgrade.mutate({ id: upgradeId, data: { phase } })}
              title={`Set phase to ${phase}`}
            >
              <div className={cn(
                "w-2.5 h-2.5 rounded-full transition-all",
                idx < phaseIdx ? "bg-primary" :
                idx === phaseIdx ? "bg-primary ring-4 ring-primary/20" : "bg-border"
              )} />
              <span className={cn("text-[10px] font-medium whitespace-nowrap", idx === phaseIdx ? "text-primary" : idx < phaseIdx ? "text-muted-foreground" : "text-border")}>{phase}</span>
            </button>
            {idx < PHASES.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-1 mb-3", idx < phaseIdx ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Budget card */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 mb-5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(committed)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Committed</p>
            {selectedOption && <p className="text-[10px] text-muted-foreground truncate">{selectedOption.name}</p>}
          </div>
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(paid)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Paid so far</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-muted-foreground">{formatCurrency(upgrade.budget)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Budget</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(Math.max(0, upgrade.budget - upgrade.spent))} left</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{Math.round(progress)}% of budget used</span>
            <span>{formatCurrency(upgrade.spent)} spent</span>
          </div>
        </div>
      </div>

      {/* Options */}
      <section className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Options &amp; Quotes</h2>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => setAddOptionOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add quote
          </Button>
        </div>

        {loadingOptions ? <div className="h-12 rounded-xl bg-muted animate-pulse" /> :
         options.length === 0 ? (
          <button onClick={() => setAddOptionOpen(true)} className="w-full border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
            + Add your first vendor quote
          </button>
        ) : (
          <div className="space-y-2">
            {/* Selected first */}
            {[...options].sort((a: any, b: any) => (b.isSelected ? 1 : 0) - (a.isSelected ? 1 : 0)).map((opt: any) => (
              <OptionCard key={opt.id} option={opt} upgradeId={upgradeId} onLogPayment={() => setPaymentFor(opt)} />
            ))}
          </div>
        )}
      </section>

      {/* Items */}
      <section className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Items to get
            {items.length > 0 && <span className="ml-2 font-normal normal-case text-muted-foreground/70">{doneItems.length} done · {needsAction.length + orderedItems.length} remaining</span>}
          </h2>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => { setEditItem(null); setAddItemOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />Add item
          </Button>
        </div>

        {loadingItems ? <div className="h-24 rounded-xl bg-muted animate-pulse" /> :
         items.length === 0 ? (
          <button onClick={() => setAddItemOpen(true)} className="w-full border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-2">
            <Package className="h-4 w-4" />Add items to track (sink, tiles, faucet…)
          </button>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden px-4">
            {needsAction.length > 0 && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 pt-3 pb-1">⚠ Needs action</p>
                {needsAction.map((item: any) => (
                  <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} />
                ))}
              </>
            )}
            {orderedItems.length > 0 && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 pt-3 pb-1">⏳ Ordered / in transit</p>
                {orderedItems.map((item: any) => (
                  <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} />
                ))}
              </>
            )}
            {doneItems.length > 0 && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 pb-1">✓ Done</p>
                {doneItems.map((item: any) => (
                  <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} />
                ))}
              </>
            )}
            <button onClick={() => { setEditItem(null); setAddItemOpen(true); }} className="flex items-center gap-1.5 text-xs text-primary font-medium py-3">
              <Plus className="h-3.5 w-3.5" />Add item
            </button>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</h2>
        {editingNotes ? (
          <div className="space-y-2">
            <Textarea rows={4} value={notesValue} onChange={e => setNotesValue(e.target.value)} autoFocus className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { updateUpgrade.mutate({ id: upgradeId, data: { notes: notesValue } }); setEditingNotes(false); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNotesValue(upgrade.notes || ""); setEditingNotes(true); }}
            className="w-full text-left rounded-xl border border-border bg-amber-50/50 dark:bg-amber-950/10 p-3 min-h-[60px] hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
          >
            {upgrade.notes
              ? <p className="text-sm text-muted-foreground leading-relaxed">{upgrade.notes}</p>
              : <p className="text-sm text-muted-foreground/50 italic">Tap to add notes…</p>
            }
          </button>
        )}
      </section>

      {/* Dialogs */}
      <AddOptionDialog upgradeId={upgradeId} open={addOptionOpen} onClose={() => setAddOptionOpen(false)} />
      <AddItemDialog upgradeId={upgradeId} open={addItemOpen || !!editItem} onClose={() => { setAddItemOpen(false); setEditItem(null); }} editItem={editItem} />
      {paymentFor && <LogPaymentDialog upgradeId={upgradeId} optionId={paymentFor.id} optionName={paymentFor.name} open={!!paymentFor} onClose={() => setPaymentFor(null)} />}
    </div>
  );
}
