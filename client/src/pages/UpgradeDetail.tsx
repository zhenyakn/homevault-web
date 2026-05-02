import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Plus, ChevronDown, ChevronUp, Phone,
  Check, Pencil, Trash2, CreditCard, Loader2, Package, Receipt, Settings2,
} from "lucide-react";
import { FileUpload } from "@/components/FileUpload";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = "Need to find" | "Researching" | "Quoted" | "Ordered" | "Delivered" | "Installed";
const ITEM_STATUSES: ItemStatus[] = ["Need to find", "Researching", "Quoted", "Ordered", "Delivered", "Installed"];
const PHASES = ["Planning", "Sourcing", "Building", "Done"] as const;
type Phase = typeof PHASES[number];

function phaseToStatus(phase: Phase): "Planned" | "In Progress" | "Done" {
  if (phase === "Planning") return "Planned";
  if (phase === "Done") return "Done";
  return "In Progress";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely coerce a DB JSON-array field to a real array.
 *  MariaDB via the HA addon may return JSON columns as strings instead of
 *  parsed objects — this handles both cases. */
function asArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const STATUS_COLORS: Record<ItemStatus, string> = {
  "Need to find": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "Researching":  "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "Quoted":       "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "Ordered":      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  "Delivered":    "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  "Installed":    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

function statusBadge(status: ItemStatus, label: string) {
  return <Badge className={cn("text-xs border-0 h-5", STATUS_COLORS[status])}>{label}</Badge>;
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function EditUpgradeDialog({
  upgrade, open, onClose,
}: {
  upgrade: any; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const mut = trpc.upgrades.update.useMutation({
    onSuccess: () => { u.upgrades.list.invalidate(); onClose(); toast.success(t("upgradeDetail.projectUpdated")); },
    onError: e => toast.error(e.message),
  });

  const [f, setF] = useState({ label: "", description: "", budget: "", status: "" });

  useEffect(() => {
    if (open) {
      setF({
        label: upgrade.label,
        description: upgrade.description || "",
        budget: String(upgrade.budget / 100),
        status: upgrade.status,
      });
    }
  }, [open, upgrade.id]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("upgradeDetail.editProject")}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>{t("upgradeDetail.projectName")}</Label>
            <Input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{t("common.description")}</Label>
            <Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder={t("upgradeDetail.descPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("upgradeDetail.budgetField")}</Label>
              <Input type="number" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>{t("common.status")}</Label>
              <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planned">{t("status.Planned")}</SelectItem>
                  <SelectItem value="In Progress">{t("status.In Progress")}</SelectItem>
                  <SelectItem value="Done">{t("status.Done")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!f.label || !f.budget || mut.isPending}
            onClick={() => mut.mutate({
              id: upgrade.id,
              data: {
                label: f.label,
                description: f.description || undefined,
                budget: Math.round(parseFloat(f.budget) * 100),
                status: f.status as "Planned" | "In Progress" | "Done",
              },
            })}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("upgradeDetail.saveChanges")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog({
  upgradeId, open, onClose, editOption,
}: {
  upgradeId: string; open: boolean; onClose: () => void; editOption?: any;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const createMut = trpc.upgradeOptions.create.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); onClose(); toast.success(t("upgradeDetail.optionAdded")); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.upgradeOptions.update.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); onClose(); toast.success(t("upgradeDetail.optionUpdated")); },
    onError: e => toast.error(e.message),
  });

  const blank = { name: "", vendorPhone: "", totalPrice: "", timeline: "", warranty: "", scope: "", notes: "" };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(editOption ? {
        name: editOption.name,
        vendorPhone: editOption.vendorPhone || "",
        totalPrice: editOption.totalPrice ? String(editOption.totalPrice / 100) : "",
        timeline: editOption.timeline || "",
        warranty: editOption.warranty || "",
        scope: editOption.scope || "",
        notes: editOption.notes || "",
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editOption?.id]);

  const isPending = createMut.isPending || updateMut.isPending;

  const submit = () => {
    const payload = {
      name: f.name,
      vendorPhone: f.vendorPhone || undefined,
      totalPrice: f.totalPrice ? Math.round(parseFloat(f.totalPrice) * 100) : undefined,
      timeline: f.timeline || undefined,
      warranty: f.warranty || undefined,
      scope: f.scope || undefined,
      notes: f.notes || undefined,
    };
    if (editOption) updateMut.mutate({ id: editOption.id, data: payload });
    else createMut.mutate({ upgradeId, ...payload });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editOption ? t("upgradeDetail.editOption") : t("upgradeDetail.addOption")}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>{t("upgradeDetail.vendorName")}</Label>
            <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t("upgradeDetail.vendorNamePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t("upgradeDetail.totalPrice")}</Label>
              <Input type="number" value={f.totalPrice} onChange={e => setF({ ...f, totalPrice: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1"><Label>{t("common.phone")}</Label>
              <Input value={f.vendorPhone} onChange={e => setF({ ...f, vendorPhone: e.target.value })} placeholder="05x-xxx-xxxx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t("common.timeline")}</Label>
              <Input value={f.timeline} onChange={e => setF({ ...f, timeline: e.target.value })} placeholder={t("upgradeDetail.timelinePlaceholder")} />
            </div>
            <div className="space-y-1"><Label>{t("common.warranty")}</Label>
              <Input value={f.warranty} onChange={e => setF({ ...f, warranty: e.target.value })} placeholder={t("upgradeDetail.warrantyPlaceholder")} />
            </div>
          </div>
          <div className="space-y-1"><Label>{t("upgradeDetail.whatIncluded")}</Label>
            <Textarea rows={2} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} placeholder={t("upgradeDetail.scopePlaceholder")} />
          </div>
          <div className="space-y-1"><Label>{t("common.notes")}</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!f.name || isPending} onClick={submit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editOption ? t("upgradeDetail.saveChanges") : t("upgradeDetail.addOptionBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({ upgradeId, open, onClose, editItem }: { upgradeId: string; open: boolean; onClose: () => void; editItem?: any }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const create = trpc.upgradeItems.create.useMutation({
    onSuccess: () => { u.upgradeItems.list.invalidate({ upgradeId }); onClose(); toast.success(t("upgradeDetail.itemAdded")); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.upgradeItems.update.useMutation({
    onSuccess: () => { u.upgradeItems.list.invalidate({ upgradeId }); onClose(); toast.success(t("upgradeDetail.itemUpdated")); },
    onError: e => toast.error(e.message),
  });

  const blank = { name: "", vendorName: "", estimatedCost: "", actualCost: "", status: "Need to find" as ItemStatus, eta: "", notes: "" };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(editItem ? {
        name: editItem.name,
        vendorName: editItem.vendorName || "",
        estimatedCost: editItem.estimatedCost ? String(editItem.estimatedCost / 100) : "",
        actualCost: editItem.actualCost ? String(editItem.actualCost / 100) : "",
        status: editItem.status as ItemStatus,
        eta: editItem.eta || "",
        notes: editItem.notes || "",
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem?.id]);

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
        <DialogHeader><DialogTitle>{editItem ? t("upgradeDetail.editItem") : t("upgradeDetail.addItem")}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>{t("upgradeDetail.itemName")}</Label>
            <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t("upgradeDetail.itemNamePlaceholder")} />
          </div>
          <div className="space-y-1"><Label>{t("common.status")}</Label>
            <Select value={f.status} onValueChange={v => setF({ ...f, status: v as ItemStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ITEM_STATUSES.map(s => <SelectItem key={s} value={s}>{t(`itemStatus.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t("upgradeDetail.estCost")}</Label>
              <Input type="number" value={f.estimatedCost} onChange={e => setF({ ...f, estimatedCost: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1"><Label>{t("upgradeDetail.actualCostField")}</Label>
              <Input type="number" value={f.actualCost} onChange={e => setF({ ...f, actualCost: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t("upgradeDetail.vendorField")}</Label>
              <Input value={f.vendorName} onChange={e => setF({ ...f, vendorName: e.target.value })} placeholder={t("upgradeDetail.vendorPlaceholder")} />
            </div>
            <div className="space-y-1"><Label>{t("common.eta")}</Label>
              <Input type="date" value={f.eta} onChange={e => setF({ ...f, eta: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1"><Label>{t("common.notes")}</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!f.name || create.isPending || update.isPending} onClick={submit}>
            {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editItem ? t("upgradeDetail.saveChanges") : t("upgradeDetail.addItem")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogPaymentDialog({ optionId, optionName, open, onClose, upgradeId }: { optionId: string; optionName: string; open: boolean; onClose: () => void; upgradeId: string }) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const mut = trpc.upgradeOptions.logPayment.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      u.upgrades.list.invalidate();
      onClose();
      toast.success(t("upgradeDetail.paymentLogged"));
      reset();
    },
    onError: e => toast.error(e.message),
  });
  const [f, setF] = useState({ amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [receipt, setReceipt] = useState<{ url: string; filename: string; mimeType: string; size: number } | null>(null);
  const reset = () => { setF({ amount: "", date: new Date().toISOString().split("T")[0], notes: "" }); setReceipt(null); };

  useEffect(() => { if (!open) reset(); }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("upgradeDetail.logPayment")} — {optionName}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1"><Label>{t("upgradeDetail.amountRequired")}</Label>
            <Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="0" autoFocus />
          </div>
          <div className="space-y-1"><Label>{t("common.date")}</Label>
            <Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="space-y-1"><Label>{t("common.notes")}</Label>
            <Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder={t("upgradeDetail.paymentNotesPlaceholder")} />
          </div>
          <div className="space-y-1">
            <Label>{t("common.receipt")}</Label>
            <FileUpload
              onUpload={file => setReceipt(file)}
              existingFiles={receipt ? [receipt] : []}
              onRemove={() => setReceipt(null)}
              accept="image/*,.pdf"
              maxFiles={1}
            />
          </div>
          <Button className="w-full" disabled={!f.amount || mut.isPending} onClick={() => mut.mutate({
            optionId, date: f.date, amount: Math.round(parseFloat(f.amount) * 100),
            notes: f.notes || undefined,
            receipt: receipt?.url,
          })}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("upgradeDetail.logPayment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Option Card ──────────────────────────────────────────────────────────────

function OptionCard({
  option, upgradeId, onLogPayment, onEdit,
}: {
  option: any; upgradeId: string; onLogPayment: () => void; onEdit: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const [expanded, setExpanded] = useState<boolean>(option.isSelected);
  const selectMut = trpc.upgradeOptions.select.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); u.upgrades.list.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.upgradeOptions.delete.useMutation({
    onSuccess: () => u.upgradeOptions.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });
  const deletePaymentMut = trpc.upgradeOptions.deletePayment.useMutation({
    onSuccess: () => { u.upgradeOptions.list.invalidate({ upgradeId }); u.upgrades.list.invalidate(); },
    onError: e => toast.error(e.message),
  });

  // Normalize: MariaDB may return JSON columns as strings instead of parsed arrays
  const payments = asArray(option.payments);
  const paid = payments.reduce((s: number, p: any) => s + p.amount, 0);

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
            {option.isSelected && <Badge className="bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-0 text-xs h-5">{t("common.selected")} ✓</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {option.totalPrice ? formatCurrency(option.totalPrice) : t("upgradeDetail.noPrice")}{option.timeline ? ` · ${option.timeline}` : ""}
            {option.warranty ? ` · ${option.warranty} ${t("upgradeDetail.warrantyLabel")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title={t("upgradeDetail.editOption")}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {/* Selected bar */}
          {option.isSelected && (
            <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-border">
              {option.vendorPhone ? (
                <a href={`tel:${option.vendorPhone}`} className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Phone className="h-3.5 w-3.5" />{option.vendorPhone}
                </a>
              ) : <span className="text-xs text-muted-foreground">{t("upgradeDetail.noPhone")}</span>}
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("upgradeDetail.paidLabel")} <span className="text-foreground font-semibold">{formatCurrency(paid)}</span>
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
            {option.scope && <p className="text-xs text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">{t("upgradeDetail.scopeLabel")} </span>{option.scope}</p>}
            {option.notes && <p className="text-xs text-muted-foreground leading-relaxed">{option.notes}</p>}

            {/* Payments */}
            {payments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("upgradeDetail.payments")}</p>
                {payments.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs gap-2 group/payment">
                    <span className="text-muted-foreground truncate">{p.date}{p.notes ? ` · ${p.notes}` : ""}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.receipt && (
                        <a href={p.receipt} target="_blank" rel="noopener noreferrer" title={t("upgradeDetail.viewReceipt")} className="text-primary hover:text-primary/80">
                          <Receipt className="h-3 w-3" />
                        </a>
                      )}
                      <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span>
                      <button
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover/payment:opacity-100 transition-opacity"
                        title={t("upgradeDetail.deletePaymentConfirm")}
                        onClick={() => {
                          if (confirm(t("upgradeDetail.deletePaymentConfirm"))) {
                            deletePaymentMut.mutate({ optionId: option.id, paymentIndex: i });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
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
                  <Check className="h-3 w-3 mr-1" />{t("common.select")}
                </Button>
              )}
              {option.isSelected && (
                <Button size="sm" className="h-7 text-xs" onClick={onLogPayment}>
                  <CreditCard className="h-3 w-3 mr-1" />{t("upgradeDetail.logPayment")}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                disabled={deleteMut.isPending}
                onClick={() => { if (confirm(t("upgradeDetail.deleteOptionConfirm"))) deleteMut.mutate({ id: option.id }); }}>
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

function ItemRow({ item, upgradeId, onEdit, onAllDone }: {
  item: any; upgradeId: string; onEdit: () => void; onAllDone: (newStatus: string) => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const updateMut = trpc.upgradeItems.update.useMutation({
    onSuccess: async (_, vars) => {
      await u.upgradeItems.list.invalidate({ upgradeId });
      const allItems = u.upgradeItems.list.getData({ upgradeId }) ?? [];
      const newStatus = (vars.data as any).status as string | undefined;
      if (newStatus && ["Delivered", "Installed"].includes(newStatus)) {
        const othersDone = allItems
          .filter((i: any) => i.id !== item.id)
          .every((i: any) => ["Delivered", "Installed"].includes(i.status));
        if (othersDone) onAllDone(newStatus);
      }
    },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.upgradeItems.delete.useMutation({
    onSuccess: () => u.upgradeItems.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });

  const isDone = ["Delivered", "Installed"].includes(item.status);

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug", isDone && "text-muted-foreground line-through")}>{item.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          {item.vendorName && <span>{item.vendorName}</span>}
          {item.eta && <span>{t("common.eta")} {item.eta}</span>}
          {item.notes && <span className="truncate max-w-[160px]">{item.notes}</span>}
        </p>
      </div>

      {/* Right: cost + status dropdown + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {item.actualCost || item.estimatedCost ? (
          <p className={cn("text-sm font-semibold tabular-nums", isDone && "text-muted-foreground")}>
            {item.actualCost ? formatCurrency(item.actualCost) : formatCurrency(item.estimatedCost)}
          </p>
        ) : null}

        {/* Status dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none">
              {statusBadge(item.status, t(`itemStatus.${item.status}`))}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ITEM_STATUSES.map(s => (
              <DropdownMenuItem
                key={s}
                className={cn("text-xs gap-2", s === item.status && "font-semibold")}
                onClick={() => {
                  if (s !== item.status) updateMut.mutate({ id: item.id, data: { status: s } });
                }}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLORS[s].split(" ")[0])} />
                {t(`itemStatus.${s}`)}
                {s === item.status && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Always-visible actions */}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit} title={t("upgradeDetail.editItem")}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => { if (confirm(t("upgradeDetail.deleteItemConfirm"))) deleteMut.mutate({ id: item.id }); }}
            title={t("upgradeDetail.deleteItemTitle")}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
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

  const { t } = useTranslation();
  const u = trpc.useUtils();
  const { data: upgrades, isLoading: loadingUpgrade } = trpc.upgrades.list.useQuery();
  const { data: options = [], isLoading: loadingOptions } = trpc.upgradeOptions.list.useQuery({ upgradeId });
  const { data: items = [], isLoading: loadingItems } = trpc.upgradeItems.list.useQuery({ upgradeId });

  const upgrade = upgrades?.find(up => up.id === upgradeId);

  const updateUpgrade = trpc.upgrades.update.useMutation({
    onSuccess: () => u.upgrades.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const [editUpgradeOpen, setEditUpgradeOpen] = useState(false);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editOption, setEditOption] = useState<any>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [paymentFor, setPaymentFor] = useState<any>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingPhase, setSavingPhase] = useState<Phase | null>(null);

  if (loadingUpgrade) return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!upgrade) return <div className="p-6 text-center text-muted-foreground">{t("upgradeDetail.notFound")} <button className="underline" onClick={() => navigate("/upgrades")}>{t("common.back")}</button></div>;

  const selectedOption = options.find((o: any) => o.isSelected);
  const committed = selectedOption?.totalPrice || 0;
  // Normalize selectedOption.payments — may be a JSON string from MariaDB
  const selectedPayments = asArray(selectedOption?.payments);
  const paid = selectedPayments.reduce((s: number, p: any) => s + p.amount, 0);
  const spentAmt = upgrade.spent ?? 0;
  const progress = upgrade.budget > 0 ? Math.min(100, (spentAmt / upgrade.budget) * 100) : 0;

  const needsAction = items.filter((i: any) => ["Need to find", "Researching", "Quoted"].includes(i.status));
  const orderedItems = items.filter((i: any) => i.status === "Ordered");
  const doneItems = items.filter((i: any) => ["Delivered", "Installed"].includes(i.status));

  const currentPhase = ((upgrade as any).phase || "Planning") as Phase;
  const phaseIdx = PHASES.indexOf(currentPhase);

  const setPhase = (phase: Phase) => {
    setSavingPhase(phase);
    updateUpgrade.mutate(
      { id: upgradeId, data: { phase, status: phaseToStatus(phase) } },
      { onSettled: () => setSavingPhase(null) },
    );
  };

  const handleAllDone = () => {
    if (currentPhase === "Done") return;
    toast(t("upgradeDetail.allItemsDoneTitle"), {
      description: t("upgradeDetail.allItemsDoneDesc"),
      action: {
        label: t("upgradeDetail.markDoneAction"),
        onClick: () => setPhase("Done"),
      },
      duration: 8000,
    });
  };

  return (
    <div className="space-y-5 pb-10">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2 mb-1" onClick={() => navigate("/upgrades")}>
            <ArrowLeft className="h-4 w-4" />{t("upgrades.title")}
          </Button>
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">{upgrade.label}</h1>
              {upgrade.description && <p className="text-sm text-muted-foreground mt-1">{upgrade.description}</p>}
            </div>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-muted-foreground shrink-0 mt-0.5"
              onClick={() => setEditUpgradeOpen(true)}
              title={t("upgradeDetail.editProject")}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Phase stepper — top-right on wide screens */}
        <div className="hidden sm:flex items-center shrink-0 gap-0">
          {PHASES.map((phase, idx) => (
            <div key={phase} className="flex items-center">
              <button
                className="flex flex-col items-center gap-1 px-1 group"
                onClick={() => setPhase(phase)}
                title={t("upgradeDetail.setPhaseTitle", { phase: t(`phases.${phase}`) })}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full transition-all flex items-center justify-center",
                  idx < phaseIdx ? "bg-primary" :
                  idx === phaseIdx ? "bg-primary ring-4 ring-primary/20" : "bg-border group-hover:bg-muted-foreground/30"
                )}>
                  {savingPhase === phase && <Loader2 className="h-2 w-2 animate-spin text-primary-foreground" />}
                </div>
                <span className={cn(
                  "text-[10px] font-medium whitespace-nowrap",
                  idx === phaseIdx ? "text-primary" : idx < phaseIdx ? "text-muted-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                )}>{t(`phases.${phase}`)}</span>
              </button>
              {idx < PHASES.length - 1 && (
                <div className={cn("w-8 h-0.5 mx-0.5 mb-3", idx < phaseIdx ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Phase stepper — mobile */}
      <div className="flex items-center sm:hidden">
        {PHASES.map((phase, idx) => (
          <div key={phase} className="flex items-center flex-1 last:flex-none">
            <button className="flex flex-col items-center gap-1 w-full" onClick={() => setPhase(phase)}>
              <div className={cn("w-3 h-3 rounded-full transition-all", idx < phaseIdx ? "bg-primary" : idx === phaseIdx ? "bg-primary ring-4 ring-primary/20" : "bg-border")}>
                {savingPhase === phase && <Loader2 className="h-2 w-2 animate-spin text-primary-foreground" />}
              </div>
              <span className={cn("text-[10px] font-medium whitespace-nowrap", idx === phaseIdx ? "text-primary" : idx < phaseIdx ? "text-muted-foreground" : "text-muted-foreground/40")}>{t(`phases.${phase}`)}</span>
            </button>
            {idx < PHASES.length - 1 && <div className={cn("flex-1 h-0.5 mx-1 mb-3", idx < phaseIdx ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {/* Budget card */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(committed)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("upgradeDetail.vendors").split(" ")[0]}</p>
            {selectedOption && <p className="text-[10px] text-muted-foreground truncate">{selectedOption.name}</p>}
          </div>
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(paid)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("upgrades.paidSoFar")}</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-muted-foreground">{formatCurrency(upgrade.budget)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("common.budget")}</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(Math.max(0, upgrade.budget - spentAmt))} {t("upgradeDetail.leftLabel")}</p>
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t("upgradeDetail.budgetUsed", { pct: Math.round(progress) })}</span>
            <span>{formatCurrency(spentAmt)} {t("dashboard.paid")}</span>
          </div>
        </div>
      </div>

      {/* Options + Items — two columns on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* Options */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("upgradeDetail.vendors")}</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => { setEditOption(null); setOptionDialogOpen(true); }}>
              <Plus className="h-3.5 w-3.5" />{t("repairDetail.addQuote")}
            </Button>
          </div>

          {loadingOptions ? <div className="h-12 rounded-xl bg-muted animate-pulse" /> :
           options.length === 0 ? (
            <button onClick={() => { setEditOption(null); setOptionDialogOpen(true); }} className="w-full border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">
              + {t("upgradeDetail.addFirstOption")}
            </button>
          ) : (
            <div className="space-y-2">
              {[...options].sort((a: any, b: any) => (b.isSelected ? 1 : 0) - (a.isSelected ? 1 : 0)).map((opt: any) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  upgradeId={upgradeId}
                  onLogPayment={() => setPaymentFor(opt)}
                  onEdit={() => { setEditOption(opt); setOptionDialogOpen(true); }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Items */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t("upgradeDetail.items")}
              {items.length > 0 && <span className="ml-2 font-normal normal-case text-muted-foreground/70">{doneItems.length} {t("common.done").toLowerCase()} · {needsAction.length + orderedItems.length} {t("dashboard.remaining").toLowerCase()}</span>}
            </h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={() => { setEditItem(null); setAddItemOpen(true); }}>
              <Plus className="h-3.5 w-3.5" />{t("upgradeDetail.addItem")}
            </Button>
          </div>

          {loadingItems ? <div className="h-24 rounded-xl bg-muted animate-pulse" /> :
           items.length === 0 ? (
            <button onClick={() => setAddItemOpen(true)} className="w-full border border-dashed border-border rounded-xl p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-2">
              <Package className="h-4 w-4" />{t("upgradeDetail.addFirstItem")}
            </button>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden px-4">
              {needsAction.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 pt-3 pb-1">⚠ {t("upgradeDetail.needsAction")}</p>
                  {needsAction.map((item: any) => (
                    <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} onAllDone={handleAllDone} />
                  ))}
                </>
              )}
              {orderedItems.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 pt-3 pb-1">⏳ {t("upgradeDetail.orderedInTransit")}</p>
                  {orderedItems.map((item: any) => (
                    <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} onAllDone={handleAllDone} />
                  ))}
                </>
              )}
              {doneItems.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 pb-1">✓ {t("upgradeDetail.doneSectionTitle")}</p>
                  {doneItems.map((item: any) => (
                    <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} onAllDone={handleAllDone} />
                  ))}
                </>
              )}
              <button onClick={() => { setEditItem(null); setAddItemOpen(true); }} className="flex items-center gap-1.5 text-xs text-primary font-medium py-3">
                <Plus className="h-3.5 w-3.5" />{t("upgradeDetail.addItem")}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("common.notes")}</h2>
        {editingNotes ? (
          <div className="space-y-2">
            <Textarea rows={4} value={notesValue} onChange={e => setNotesValue(e.target.value)} autoFocus className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { updateUpgrade.mutate({ id: upgradeId, data: { notes: notesValue } }); setEditingNotes(false); }}>{t("common.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>{t("common.cancel")}</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNotesValue(upgrade.notes || ""); setEditingNotes(true); }}
            className="w-full text-left rounded-xl border border-border bg-amber-50/50 dark:bg-amber-950/10 p-3 min-h-[60px] hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
          >
            {upgrade.notes
              ? <p className="text-sm text-muted-foreground leading-relaxed">{upgrade.notes}</p>
              : <p className="text-sm text-muted-foreground/50 italic">{t("upgradeDetail.tapToAddNotes")}</p>
            }
          </button>
        )}
      </section>

      {/* Dialogs */}
      <EditUpgradeDialog upgrade={upgrade} open={editUpgradeOpen} onClose={() => setEditUpgradeOpen(false)} />
      <OptionDialog
        upgradeId={upgradeId}
        open={optionDialogOpen}
        onClose={() => { setOptionDialogOpen(false); setEditOption(null); }}
        editOption={editOption}
      />
      <AddItemDialog
        upgradeId={upgradeId}
        open={addItemOpen || !!editItem}
        onClose={() => { setAddItemOpen(false); setEditItem(null); }}
        editItem={editItem}
      />
      {paymentFor && (
        <LogPaymentDialog
          upgradeId={upgradeId}
          optionId={paymentFor.id}
          optionName={paymentFor.name}
          open={!!paymentFor}
          onClose={() => setPaymentFor(null)}
        />
      )}
    </div>
  );
}
