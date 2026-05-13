import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
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

type Upgrade = RouterOutputs["upgrades"]["list"][number];
type UpgradeOption = RouterOutputs["upgradeOptions"]["list"][number];
type UpgradeItem = RouterOutputs["upgradeItems"]["list"][number];

const UPGRADE_STATUSES = ["idea", "planning", "in_progress", "completed"] as const;
type UpgradeStatusStep = typeof UPGRADE_STATUSES[number];

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

const PURCHASED_BADGE = "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400";
const PENDING_BADGE   = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function purchasedBadge(purchased: boolean, label: string) {
  return <Badge className={cn("text-xs border-0 h-5", purchased ? PURCHASED_BADGE : PENDING_BADGE)}>{label}</Badge>;
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function EditUpgradeDialog({
  upgrade, open, onClose,
}: {
  upgrade: Upgrade; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const mut = trpc.upgrades.update.useMutation({
    onSuccess: () => { u.upgrades.list.invalidate(); onClose(); toast.success(t("upgradeDetail.projectUpdated")); },
    onError: e => toast.error(e.message),
  });

  const [f, setF] = useState({ title: "", description: "", estimatedCost: "", status: "" });

  useEffect(() => {
    if (open) {
      setF({
        title: upgrade.title ?? "",
        description: upgrade.description || "",
        estimatedCost: upgrade.estimatedCost ? String(upgrade.estimatedCost / 100) : "",
        status: upgrade.status ?? "planning",
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
            <Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{t("common.description")}</Label>
            <Textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder={t("upgradeDetail.descPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("upgradeDetail.budgetField")}</Label>
              <Input type="number" value={f.estimatedCost} onChange={e => setF({ ...f, estimatedCost: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>{t("common.status")}</Label>
              <Select value={f.status} onValueChange={v => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">{t("status.idea")}</SelectItem>
                  <SelectItem value="planning">{t("status.planning")}</SelectItem>
                  <SelectItem value="in_progress">{t("status.in_progress")}</SelectItem>
                  <SelectItem value="completed">{t("status.completed")}</SelectItem>
                  <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!f.title || mut.isPending}
            onClick={() => mut.mutate({
              id: upgrade.id,
              data: {
                title: f.title,
                description: f.description || undefined,
                estimatedCost: f.estimatedCost ? Math.round(parseFloat(f.estimatedCost) * 100) : undefined,
                status: f.status as UpgradeStatusStep,
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
  upgradeId: string; open: boolean; onClose: () => void; editOption?: UpgradeOption;
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
        // DB stores title/estimatedCost/description; router UI fields (vendorPhone, timeline, warranty) are not persisted
        name: editOption.title,
        vendorPhone: "",
        totalPrice: editOption.estimatedCost ? String(editOption.estimatedCost / 100) : "",
        timeline: "",
        warranty: "",
        scope: editOption.description || "",
        notes: "",
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editOption?.id]);

  const isPending = createMut.isPending || updateMut.isPending;

  const submit = () => {
    // DB stores title/estimatedCost/description; vendorPhone/timeline/warranty
    // have no columns — fold into description so user-entered context survives.
    const extras = [
      f.vendorPhone && `${t("common.phone")}: ${f.vendorPhone}`,
      f.timeline && `${t("common.timeline")}: ${f.timeline}`,
      f.warranty && `${t("common.warranty")}: ${f.warranty}`,
      f.notes && `${t("common.notes")}: ${f.notes}`,
    ].filter(Boolean).join("\n");
    const description = [f.scope, extras].filter(Boolean).join("\n\n") || undefined;
    const payload = {
      title: f.name,
      estimatedCost: f.totalPrice ? Math.round(parseFloat(f.totalPrice) * 100) : undefined,
      description,
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

function AddItemDialog({ upgradeId, open, onClose, editItem }: { upgradeId: string; open: boolean; onClose: () => void; editItem?: UpgradeItem }) {
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

  const blank = { name: "", store: "", estimatedCost: "", actualCost: "", purchased: false, notes: "" };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(editItem ? {
        name: editItem.name,
        store: editItem.store || "",
        estimatedCost: editItem.estimatedCost ? String(editItem.estimatedCost / 100) : "",
        actualCost: editItem.actualCost ? String(editItem.actualCost / 100) : "",
        purchased: editItem.purchased ?? false,
        notes: editItem.notes || "",
      } : blank);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem?.id]);

  const submit = () => {
    const payload = {
      name: f.name,
      store: f.store || undefined,
      estimatedCost: f.estimatedCost ? Math.round(parseFloat(f.estimatedCost) * 100) : undefined,
      actualCost: f.actualCost ? Math.round(parseFloat(f.actualCost) * 100) : undefined,
      purchased: f.purchased,
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
              <Input value={f.store} onChange={e => setF({ ...f, store: e.target.value })} placeholder={t("upgradeDetail.vendorPlaceholder")} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="purchased" checked={f.purchased} onChange={e => setF({ ...f, purchased: e.target.checked })} className="h-4 w-4" />
              <Label htmlFor="purchased">{t("upgradeDetail.purchased")}</Label>
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
  option: UpgradeOption; upgradeId: string; onLogPayment: () => void; onEdit: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const [expanded, setExpanded] = useState<boolean>(option.selected ?? false);
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
  const paid = payments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);

  return (
    <div className={cn("border rounded-xl overflow-hidden transition-colors", option.selected ? "border-primary" : "border-border")}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{option.title}</span>
            {option.selected && <Badge className="bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-0 text-xs h-5">{t("common.selected")} ✓</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {option.estimatedCost ? formatCurrency(option.estimatedCost) : t("upgradeDetail.noPrice")}
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
          {option.selected && (
            <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-border">
              <span className="text-xs text-muted-foreground">{t("common.selected")}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("upgradeDetail.paidLabel")} <span className="text-foreground font-semibold">{formatCurrency(paid)}</span>
                {option.estimatedCost ? ` / ${formatCurrency(option.estimatedCost)}` : ""}
              </span>
            </div>
          )}

          <div className="px-4 py-3 space-y-3">
            {option.description && <p className="text-xs text-muted-foreground leading-relaxed"><span className="text-foreground font-medium">{t("upgradeDetail.scopeLabel")} </span>{option.description}</p>}

            {/* Payments */}
            {payments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("upgradeDetail.payments")}</p>
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs gap-2 group/payment">
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
                            deletePaymentMut.mutate({ optionId: option.id, paymentId: p.id });
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
              {!option.selected && (
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  disabled={selectMut.isPending}
                  onClick={() => selectMut.mutate({ upgradeId, optionId: option.id })}>
                  <Check className="h-3 w-3 mr-1" />{t("common.select")}
                </Button>
              )}
              {option.selected && (
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
  item: UpgradeItem; upgradeId: string; onEdit: () => void; onAllDone: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const updateMut = trpc.upgradeItems.update.useMutation({
    onSuccess: async () => {
      await u.upgradeItems.list.invalidate({ upgradeId });
      const allItems = u.upgradeItems.list.getData({ upgradeId }) ?? [];
      if (allItems.length > 0 && allItems.every(i => i.purchased)) onAllDone();
    },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.upgradeItems.delete.useMutation({
    onSuccess: () => u.upgradeItems.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });

  const isDone = item.purchased ?? false;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium leading-snug", isDone && "text-muted-foreground line-through")}>{item.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          {item.store && <span>{item.store}</span>}
          {item.notes && <span className="truncate max-w-[160px]">{item.notes}</span>}
        </p>
      </div>

      {/* Right: cost + purchased toggle + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {(item.actualCost || item.estimatedCost) ? (
          <p className={cn("text-sm font-semibold tabular-nums", isDone && "text-muted-foreground")}>
            {item.actualCost ? formatCurrency(item.actualCost) : formatCurrency(item.estimatedCost ?? 0)}
          </p>
        ) : null}

        <button
          className="focus:outline-none"
          onClick={() => updateMut.mutate({ id: item.id, data: { purchased: !isDone } })}
        >
          {purchasedBadge(isDone, isDone ? t("upgradeDetail.purchased") : t("upgradeDetail.pending"))}
        </button>

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
  const [editOption, setEditOption] = useState<UpgradeOption | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<UpgradeItem | null>(null);
  const [paymentFor, setPaymentFor] = useState<UpgradeOption | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingStatus, setSavingStatus] = useState<UpgradeStatusStep | null>(null);

  if (loadingUpgrade) return <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!upgrade) return <div className="p-6 text-center text-muted-foreground">{t("upgradeDetail.notFound")} <button className="underline" onClick={() => navigate("/upgrades")}>{t("common.back")}</button></div>;

  const selectedOption = options.find(o => o.selected);
  const committed = selectedOption?.estimatedCost || 0;
  // Normalize selectedOption.payments — may be a JSON string from MariaDB
  const selectedPayments = asArray(selectedOption?.payments);
  const paid = selectedPayments.reduce((s: number, p: any) => s + p.amount, 0);
  const spentAmt = upgrade.actualCost ?? 0;
  const progress = (upgrade.estimatedCost ?? 0) > 0 ? Math.min(100, (spentAmt / upgrade.estimatedCost!) * 100) : 0;

  const needsAction = items.filter(i => !i.purchased);
  const doneItems = items.filter(i => i.purchased);

  const currentStatus = (upgrade.status || "planning") as UpgradeStatusStep;
  const statusIdx = UPGRADE_STATUSES.indexOf(currentStatus);

  const setStatus = (status: UpgradeStatusStep) => {
    setSavingStatus(status);
    updateUpgrade.mutate(
      { id: upgradeId, data: { status } },
      { onSettled: () => setSavingStatus(null) },
    );
  };

  const handleAllDone = () => {
    if (currentStatus === "completed") return;
    toast(t("upgradeDetail.allItemsDoneTitle"), {
      description: t("upgradeDetail.allItemsDoneDesc"),
      action: {
        label: t("upgradeDetail.markDoneAction"),
        onClick: () => setStatus("completed"),
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
              <h1 className="text-xl font-bold tracking-tight">{upgrade.title}</h1>
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

        {/* Status stepper — top-right on wide screens */}
        <div className="hidden sm:flex items-center shrink-0 gap-0">
          {UPGRADE_STATUSES.map((s, idx) => (
            <div key={s} className="flex items-center">
              <button
                className="flex flex-col items-center gap-1 px-1 group"
                onClick={() => setStatus(s)}
              >
                <div className={cn(
                  "w-3 h-3 rounded-full transition-all flex items-center justify-center",
                  idx < statusIdx ? "bg-primary" :
                  idx === statusIdx ? "bg-primary ring-4 ring-primary/20" : "bg-border group-hover:bg-muted-foreground/30"
                )}>
                  {savingStatus === s && <Loader2 className="h-2 w-2 animate-spin text-primary-foreground" />}
                </div>
                <span className={cn(
                  "text-[10px] font-medium whitespace-nowrap",
                  idx === statusIdx ? "text-primary" : idx < statusIdx ? "text-muted-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                )}>{t(`status.${s}`, { defaultValue: s })}</span>
              </button>
              {idx < UPGRADE_STATUSES.length - 1 && (
                <div className={cn("w-8 h-0.5 mx-0.5 mb-3", idx < statusIdx ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status stepper — mobile */}
      <div className="flex items-center sm:hidden">
        {UPGRADE_STATUSES.map((s, idx) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <button className="flex flex-col items-center gap-1 w-full" onClick={() => setStatus(s)}>
              <div className={cn("w-3 h-3 rounded-full transition-all", idx < statusIdx ? "bg-primary" : idx === statusIdx ? "bg-primary ring-4 ring-primary/20" : "bg-border")}>
                {savingStatus === s && <Loader2 className="h-2 w-2 animate-spin text-primary-foreground" />}
              </div>
              <span className={cn("text-[10px] font-medium whitespace-nowrap", idx === statusIdx ? "text-primary" : idx < statusIdx ? "text-muted-foreground" : "text-muted-foreground/40")}>{t(`status.${s}`, { defaultValue: s })}</span>
            </button>
            {idx < UPGRADE_STATUSES.length - 1 && <div className={cn("flex-1 h-0.5 mx-1 mb-3", idx < statusIdx ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {/* Budget card */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(committed)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("upgradeDetail.vendors").split(" ")[0]}</p>
            {selectedOption && <p className="text-[10px] text-muted-foreground truncate">{selectedOption.title}</p>}
          </div>
          <div>
            <p className="text-base font-bold tabular-nums">{formatCurrency(paid)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("upgrades.paidSoFar")}</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-muted-foreground">{formatCurrency(upgrade.estimatedCost ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{t("common.budget")}</p>
            <p className="text-[10px] text-muted-foreground">{formatCurrency(Math.max(0, (upgrade.estimatedCost ?? 0) - spentAmt))} {t("upgradeDetail.leftLabel")}</p>
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
              {[...options].sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0)).map(opt => (
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
              {items.length > 0 && <span className="ml-2 font-normal normal-case text-muted-foreground/70">{doneItems.length} {t("common.done").toLowerCase()} · {needsAction.length} {t("dashboard.remaining").toLowerCase()}</span>}
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
                  {needsAction.map(item => (
                    <ItemRow key={item.id} item={item} upgradeId={upgradeId} onEdit={() => { setEditItem(item); setAddItemOpen(true); }} onAllDone={handleAllDone} />
                  ))}
                </>
              )}
              {doneItems.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 pb-1">✓ {t("upgradeDetail.doneSectionTitle")}</p>
                  {doneItems.map(item => (
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
        editOption={editOption ?? undefined}
      />
      <AddItemDialog
        upgradeId={upgradeId}
        open={addItemOpen || !!editItem}
        onClose={() => { setAddItemOpen(false); setEditItem(null); }}
        editItem={editItem ?? undefined}
      />
      {paymentFor && (
        <LogPaymentDialog
          upgradeId={upgradeId}
          optionId={paymentFor.id}
          optionName={paymentFor.title}
          open={!!paymentFor}
          onClose={() => setPaymentFor(null)}
        />
      )}
    </div>
  );
}
