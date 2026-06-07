import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { formatCurrency, asArray, cn } from "@/lib/utils";
import { toast } from "sonner";
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
  Plus,
  Check,
  Pencil,
  Trash2,
  CreditCard,
  Loader2,
  Package,
  Receipt,
} from "lucide-react";
import {
  DetailHeader,
  StatusStepperCard,
  DetailSectionHeader,
  DetailSummaryCard,
  NotesCard,
  CollapsibleCard,
} from "@/components/DetailPage";
import { LogPaymentDialog } from "@/components/LogPaymentDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type Upgrade = RouterOutputs["upgrades"]["list"][number];
type UpgradeOption = RouterOutputs["upgradeOptions"]["list"][number];
type UpgradeItem = RouterOutputs["upgradeItems"]["list"][number];

const UPGRADE_STATUSES = [
  "idea",
  "planning",
  "in_progress",
  "completed",
] as const;
type UpgradeStatusStep = (typeof UPGRADE_STATUSES)[number];

const PURCHASED_BADGE =
  "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400";
const PENDING_BADGE =
  "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function purchasedBadge(purchased: boolean, label: string) {
  return (
    <Badge
      className={cn(
        "text-xs border-0 h-5",
        purchased ? PURCHASED_BADGE : PENDING_BADGE
      )}
    >
      {label}
    </Badge>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function EditUpgradeDialog({
  upgrade,
  open,
  onClose,
}: {
  upgrade: Upgrade;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const mut = trpc.upgrades.update.useMutation({
    onSuccess: () => {
      u.upgrades.list.invalidate();
      onClose();
      toast.success(t("upgradeDetail.projectUpdated"));
    },
    onError: e => toast.error(e.message),
  });

  const [f, setF] = useState({
    title: "",
    description: "",
    estimatedCost: "",
    status: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setF({
        title: upgrade.title ?? "",
        description: upgrade.description || "",
        estimatedCost: upgrade.estimatedCost
          ? String(upgrade.estimatedCost / 100)
          : "",
        status: upgrade.status ?? "planning",
        notes: upgrade.notes || "",
      });
    }
  }, [open, upgrade.id]);

  const save = () =>
    mut.mutate({
      id: upgrade.id,
      data: {
        title: f.title,
        description: f.description || undefined,
        estimatedCost: f.estimatedCost
          ? Math.round(parseFloat(f.estimatedCost) * 100)
          : undefined,
        status: f.status as UpgradeStatusStep,
        notes: f.notes || undefined,
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("upgradeDetail.editProject")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("upgradeDetail.projectName")}</Label>
            <Input
              value={f.title}
              onChange={e => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.description")}</Label>
            <Textarea
              rows={2}
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
              placeholder={t("upgradeDetail.descPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.budgetField")}</Label>
              <Input
                type="number"
                value={f.estimatedCost}
                onChange={e => setF({ ...f, estimatedCost: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select
                value={f.status}
                onValueChange={v => setF({ ...f, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idea">{t("status.idea")}</SelectItem>
                  <SelectItem value="planning">
                    {t("status.planning")}
                  </SelectItem>
                  <SelectItem value="in_progress">
                    {t("status.in_progress")}
                  </SelectItem>
                  <SelectItem value="completed">
                    {t("status.completed")}
                  </SelectItem>
                  <SelectItem value="cancelled">
                    {t("status.cancelled")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              rows={3}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!f.title || mut.isPending}
            >
              {mut.isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog({
  upgradeId,
  open,
  onClose,
  editOption,
}: {
  upgradeId: string;
  open: boolean;
  onClose: () => void;
  editOption?: UpgradeOption;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const createMut = trpc.upgradeOptions.create.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      onClose();
      toast.success(t("upgradeDetail.optionAdded"));
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.upgradeOptions.update.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      onClose();
      toast.success(t("upgradeDetail.optionUpdated"));
    },
    onError: e => toast.error(e.message),
  });

  const blank = {
    name: "",
    vendorPhone: "",
    totalPrice: "",
    timeline: "",
    warranty: "",
    scope: "",
    notes: "",
  };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(
        editOption
          ? {
              // DB stores title/estimatedCost/description; router UI fields (vendorPhone, timeline, warranty) are not persisted
              name: editOption.title,
              vendorPhone: "",
              totalPrice: editOption.estimatedCost
                ? String(editOption.estimatedCost / 100)
                : "",
              timeline: "",
              warranty: "",
              scope: editOption.description || "",
              notes: "",
            }
          : blank
      );
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
    ]
      .filter(Boolean)
      .join("\n");
    const description =
      [f.scope, extras].filter(Boolean).join("\n\n") || undefined;
    const payload = {
      title: f.name,
      estimatedCost: f.totalPrice
        ? Math.round(parseFloat(f.totalPrice) * 100)
        : undefined,
      description,
    };
    if (editOption) updateMut.mutate({ id: editOption.id, data: payload });
    else createMut.mutate({ upgradeId, ...payload });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editOption
              ? t("upgradeDetail.editOption")
              : t("upgradeDetail.addOption")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>{t("upgradeDetail.vendorName")}</Label>
              <Input
                value={f.name}
                onChange={e => setF({ ...f, name: e.target.value })}
                placeholder={t("upgradeDetail.vendorNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.totalPrice")}</Label>
              <Input
                type="number"
                value={f.totalPrice}
                onChange={e => setF({ ...f, totalPrice: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input
                value={f.vendorPhone}
                onChange={e => setF({ ...f, vendorPhone: e.target.value })}
                placeholder="05x-xxx-xxxx"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.timeline")}</Label>
              <Input
                value={f.timeline}
                onChange={e => setF({ ...f, timeline: e.target.value })}
                placeholder={t("upgradeDetail.timelinePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.warranty")}</Label>
              <Input
                value={f.warranty}
                onChange={e => setF({ ...f, warranty: e.target.value })}
                placeholder={t("upgradeDetail.warrantyPlaceholder")}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("upgradeDetail.whatIncluded")}</Label>
              <Textarea
                rows={2}
                value={f.scope}
                onChange={e => setF({ ...f, scope: e.target.value })}
                placeholder={t("upgradeDetail.scopePlaceholder")}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.notes")}</Label>
              <Textarea
                rows={2}
                value={f.notes}
                onChange={e => setF({ ...f, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={!f.name || isPending}>
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {editOption
                ? t("upgradeDetail.saveChanges")
                : t("upgradeDetail.addOptionBtn")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({
  upgradeId,
  open,
  onClose,
  editItem,
}: {
  upgradeId: string;
  open: boolean;
  onClose: () => void;
  editItem?: UpgradeItem;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const create = trpc.upgradeItems.create.useMutation({
    onSuccess: () => {
      u.upgradeItems.list.invalidate({ upgradeId });
      onClose();
      toast.success(t("upgradeDetail.itemAdded"));
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.upgradeItems.update.useMutation({
    onSuccess: () => {
      u.upgradeItems.list.invalidate({ upgradeId });
      onClose();
      toast.success(t("upgradeDetail.itemUpdated"));
    },
    onError: e => toast.error(e.message),
  });

  const blank = {
    name: "",
    store: "",
    estimatedCost: "",
    actualCost: "",
    purchased: false,
    notes: "",
  };
  const [f, setF] = useState(blank);

  useEffect(() => {
    if (open) {
      setF(
        editItem
          ? {
              name: editItem.name,
              store: editItem.store || "",
              estimatedCost: editItem.estimatedCost
                ? String(editItem.estimatedCost / 100)
                : "",
              actualCost: editItem.actualCost
                ? String(editItem.actualCost / 100)
                : "",
              purchased: editItem.purchased ?? false,
              notes: editItem.notes || "",
            }
          : blank
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editItem?.id]);

  const isPending = create.isPending || update.isPending;

  const submit = () => {
    const payload = {
      name: f.name,
      store: f.store || undefined,
      estimatedCost: f.estimatedCost
        ? Math.round(parseFloat(f.estimatedCost) * 100)
        : undefined,
      actualCost: f.actualCost
        ? Math.round(parseFloat(f.actualCost) * 100)
        : undefined,
      purchased: f.purchased,
      notes: f.notes || undefined,
    };
    if (editItem) update.mutate({ id: editItem.id, data: payload });
    else create.mutate({ upgradeId, ...payload });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editItem
              ? t("upgradeDetail.editItem")
              : t("upgradeDetail.addItem")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("upgradeDetail.itemName")}</Label>
            <Input
              value={f.name}
              onChange={e => setF({ ...f, name: e.target.value })}
              placeholder={t("upgradeDetail.itemNamePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.estCost")}</Label>
              <Input
                type="number"
                value={f.estimatedCost}
                onChange={e => setF({ ...f, estimatedCost: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.actualCostField")}</Label>
              <Input
                type="number"
                value={f.actualCost}
                onChange={e => setF({ ...f, actualCost: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.vendorField")}</Label>
              <Input
                value={f.store}
                onChange={e => setF({ ...f, store: e.target.value })}
                placeholder={t("upgradeDetail.vendorPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="purchased"
                checked={f.purchased}
                onChange={e => setF({ ...f, purchased: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="purchased">{t("upgradeDetail.purchased")}</Label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              rows={2}
              value={f.notes}
              onChange={e => setF({ ...f, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={!f.name || isPending}>
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {editItem ? t("common.save") : t("upgradeDetail.addItem")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Option Card ──────────────────────────────────────────────────────────────

function OptionCard({
  option,
  upgradeId,
  onEdit,
}: {
  option: UpgradeOption;
  upgradeId: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const u = trpc.useUtils();
  const selectMut = trpc.upgradeOptions.select.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      u.upgrades.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.upgradeOptions.delete.useMutation({
    onSuccess: () => u.upgradeOptions.list.invalidate({ upgradeId }),
    onError: e => toast.error(e.message),
  });
  const deletePaymentMut = trpc.upgradeOptions.deletePayment.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      u.upgrades.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const logMut = trpc.upgradeOptions.logPayment.useMutation({
    onSuccess: () => {
      u.upgradeOptions.list.invalidate({ upgradeId });
      u.upgrades.list.invalidate();
      setLogOpen(false);
      toast.success(t("upgradeDetail.paymentLogged"));
    },
    onError: e => toast.error(e.message),
  });

  const [logOpen, setLogOpen] = useState(false);

  const payments = asArray(option.payments) as {
    id: string;
    date: string;
    amount: number;
    notes?: string;
    receipt?: string;
  }[];
  const paid = payments.reduce((s, p) => s + (p.amount ?? 0), 0);

  const header = (
    <>
      {option.selected && (
        <Check className="h-4 w-4 text-indigo-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{option.title}</span>
          {option.selected && (
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
              {t("common.selected")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          {option.estimatedCost
            ? formatCurrency(option.estimatedCost)
            : t("upgradeDetail.noPrice")}
        </p>
      </div>
    </>
  );

  const headerActions = (
    <button
      type="button"
      className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 transition-colors"
      onClick={e => {
        e.stopPropagation();
        onEdit();
      }}
      title={t("upgradeDetail.editOption")}
    >
      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );

  return (
    <CollapsibleCard
      header={header}
      headerActions={headerActions}
      selected={option.selected ?? false}
      defaultExpanded={option.selected ?? false}
    >
      <div className="px-4 py-3 space-y-3">
        {/* Selected bar */}
        {option.selected && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("common.selected")}</span>
            <span className="tabular-nums">
              {t("upgradeDetail.paidLabel")}{" "}
              <span className="text-foreground font-semibold">
                {formatCurrency(paid)}
              </span>
              {option.estimatedCost
                ? ` / ${formatCurrency(option.estimatedCost)}`
                : ""}
            </span>
          </div>
        )}

        {/* Scope / description */}
        {option.description && (
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            <span className="text-foreground font-medium">
              {t("upgradeDetail.scopeLabel")}{" "}
            </span>
            {option.description}
          </p>
        )}

        {/* Payments */}
        {(payments.length > 0 || option.selected) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                {t("upgradeDetail.payments")}
              </p>
              {option.selected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setLogOpen(true)}
                >
                  <Plus className="h-3 w-3 me-1" />
                  {t("upgradeDetail.logPayment")}
                </Button>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("upgradeDetail.noPayments")}
              </p>
            ) : (
              <div className="space-y-1">
                {payments.map(p => (
                  <div
                    key={p.id}
                    className="group/pay flex items-center justify-between text-xs gap-2"
                  >
                    <span className="text-muted-foreground truncate">
                      {p.date}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.receipt && (
                        <a
                          href={p.receipt}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("upgradeDetail.viewReceipt")}
                          className="text-primary hover:text-primary/80"
                        >
                          <Receipt className="h-3 w-3" />
                        </a>
                      )}
                      <span className="tabular-nums font-medium">
                        {formatCurrency(p.amount)}
                      </span>
                      <button
                        type="button"
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover/pay:opacity-100 transition-opacity"
                        title={t("upgradeDetail.deletePaymentConfirm")}
                        onClick={() => {
                          if (
                            confirm(t("upgradeDetail.deletePaymentConfirm"))
                          ) {
                            deletePaymentMut.mutate({
                              optionId: option.id,
                              paymentId: p.id,
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-1 border-t border-border flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {t("upgradeDetail.totalPaid")}
                  </span>
                  <span className="tabular-nums">{formatCurrency(paid)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex gap-2 flex-wrap items-center">
          {!option.selected && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={selectMut.isPending}
              onClick={() =>
                selectMut.mutate({ upgradeId, optionId: option.id })
              }
            >
              <Check className="h-3 w-3 me-1" />
              {t("common.select")}
            </Button>
          )}
          {option.selected && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLogOpen(true)}
            >
              <CreditCard className="h-3 w-3 me-1" />
              {t("upgradeDetail.logPayment")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive ms-auto"
            disabled={deleteMut.isPending}
            onClick={() => {
              if (confirm(t("upgradeDetail.deleteOptionConfirm")))
                deleteMut.mutate({ id: option.id });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <LogPaymentDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title={`${t("upgradeDetail.logPayment")} — ${option.title}`}
        amountLabel={t("upgradeDetail.amountRequired")}
        submitLabel={t("upgradeDetail.logPayment")}
        isPending={logMut.isPending}
        onSubmit={async values => {
          await logMut.mutateAsync({ optionId: option.id, ...values });
        }}
      />
    </CollapsibleCard>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  upgradeId,
  onEdit,
  onAllDone,
}: {
  item: UpgradeItem;
  upgradeId: string;
  onEdit: () => void;
  onAllDone: () => void;
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
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            isDone && "text-muted-foreground line-through"
          )}
        >
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          {item.store && <span>{item.store}</span>}
          {item.notes && (
            <span className="truncate max-w-[160px]">{item.notes}</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {item.actualCost || item.estimatedCost ? (
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              isDone && "text-muted-foreground"
            )}
          >
            {item.actualCost
              ? formatCurrency(item.actualCost)
              : formatCurrency(item.estimatedCost ?? 0)}
          </p>
        ) : null}

        <button
          type="button"
          className="focus:outline-none"
          onClick={() =>
            updateMut.mutate({ id: item.id, data: { purchased: !isDone } })
          }
        >
          {purchasedBadge(
            isDone,
            isDone ? t("upgradeDetail.purchased") : t("upgradeDetail.pending")
          )}
        </button>

        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onEdit}
            title={t("upgradeDetail.editItem")}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(t("upgradeDetail.deleteItemConfirm")))
                deleteMut.mutate({ id: item.id });
            }}
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
  const { data: upgrades, isLoading: loadingUpgrade } =
    trpc.upgrades.list.useQuery();
  const { data: options = [], isLoading: loadingOptions } =
    trpc.upgradeOptions.list.useQuery({ upgradeId });
  const { data: items = [], isLoading: loadingItems } =
    trpc.upgradeItems.list.useQuery({ upgradeId });

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
  const [statusLoading, setStatusLoading] = useState(false);

  // Once the list has loaded and this id isn't in it (e.g. after switching
  // property), recover to the list instead of dead-ending on a 404.
  const missing = !loadingUpgrade && !upgrade;
  useEffect(() => {
    if (missing) navigate("/upgrades", { replace: true });
  }, [missing, navigate]);

  if (loadingUpgrade || !upgrade)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );

  const selectedOption = options.find(o => o.selected);
  const committed = selectedOption?.estimatedCost || 0;
  const selectedPayments = asArray(selectedOption?.payments) as {
    amount: number;
  }[];
  const paid = selectedPayments.reduce((s, p) => s + p.amount, 0);
  const budget = upgrade.estimatedCost ?? 0;
  const spentAmt = upgrade.actualCost ?? 0;
  const progress = budget > 0 ? Math.min(100, (spentAmt / budget) * 100) : 0;
  const remaining = Math.max(0, budget - spentAmt);

  const needsAction = items.filter(i => !i.purchased);
  const doneItems = items.filter(i => i.purchased);

  const setStatus = async (status: string) => {
    if (status === upgrade.status) return;
    setStatusLoading(true);
    try {
      await updateUpgrade.mutateAsync({
        id: upgradeId,
        data: { status: status as UpgradeStatusStep },
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAllDone = () => {
    if (upgrade.status === "completed") return;
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
    <div className="max-w-4xl space-y-6">
      <DetailHeader
        backLabel={t("upgrades.title")}
        onBack={() => navigate("/upgrades")}
        title={upgrade.title}
        description={upgrade.description}
        editLabel={t("common.edit")}
        onEdit={() => setEditUpgradeOpen(true)}
      />

      <StatusStepperCard
        label={t("common.progress")}
        steps={UPGRADE_STATUSES}
        currentStatus={upgrade.status ?? "planning"}
        onChange={setStatus}
        loading={statusLoading}
        getStepLabel={s => t(`status.${s}`, { defaultValue: s })}
      />

      <DetailSummaryCard
        stats={[
          {
            value: formatCurrency(committed),
            label: t("upgradeDetail.vendors").split(" ")[0],
            sub: selectedOption?.title,
          },
          {
            value: formatCurrency(paid),
            label: t("upgrades.paidSoFar"),
          },
          {
            value: formatCurrency(budget),
            label: t("common.budget"),
            sub: `${formatCurrency(remaining)} ${t("upgradeDetail.leftLabel")}`,
            muted: true,
          },
        ]}
        progress={progress}
        progressLeft={t("upgradeDetail.budgetUsed", {
          pct: Math.round(progress),
        })}
        progressRight={`${formatCurrency(spentAmt)} ${t("dashboard.paid")}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Options */}
        <section>
          <DetailSectionHeader
            label={t("upgradeDetail.vendors")}
            count={options.length}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditOption(null);
                  setOptionDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 me-1.5" />
                {t("repairDetail.addQuote")}
              </Button>
            }
          />

          {loadingOptions ? (
            <div className="h-12 rounded-lg bg-muted animate-pulse" />
          ) : options.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                setEditOption(null);
                setOptionDialogOpen(true);
              }}
              className="w-full border border-dashed border-border rounded-lg p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              + {t("upgradeDetail.addFirstOption")}
            </button>
          ) : (
            <div className="space-y-3">
              {[...options]
                .sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0))
                .map(opt => (
                  <OptionCard
                    key={opt.id}
                    option={opt}
                    upgradeId={upgradeId}
                    onEdit={() => {
                      setEditOption(opt);
                      setOptionDialogOpen(true);
                    }}
                  />
                ))}
            </div>
          )}
        </section>

        {/* Items */}
        <section>
          <DetailSectionHeader
            label={t("upgradeDetail.items")}
            count={items.length}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditItem(null);
                  setAddItemOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 me-1.5" />
                {t("upgradeDetail.addItem")}
              </Button>
            }
          />

          {loadingItems ? (
            <div className="h-24 rounded-lg bg-muted animate-pulse" />
          ) : items.length === 0 ? (
            <button
              type="button"
              onClick={() => setAddItemOpen(true)}
              className="w-full border border-dashed border-border rounded-lg p-4 text-sm text-muted-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-2"
            >
              <Package className="h-4 w-4" />
              {t("upgradeDetail.addFirstItem")}
            </button>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden px-4">
              {needsAction.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 pt-3 pb-1">
                    ⚠ {t("upgradeDetail.needsAction")}
                  </p>
                  {needsAction.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      upgradeId={upgradeId}
                      onEdit={() => {
                        setEditItem(item);
                        setAddItemOpen(true);
                      }}
                      onAllDone={handleAllDone}
                    />
                  ))}
                </>
              )}
              {doneItems.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 pb-1">
                    ✓ {t("upgradeDetail.doneSectionTitle")}
                  </p>
                  {doneItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      upgradeId={upgradeId}
                      onEdit={() => {
                        setEditItem(item);
                        setAddItemOpen(true);
                      }}
                      onAllDone={handleAllDone}
                    />
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditItem(null);
                  setAddItemOpen(true);
                }}
                className="flex items-center gap-1.5 text-xs text-primary font-medium py-3"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("upgradeDetail.addItem")}
              </button>
            </div>
          )}
        </section>
      </div>

      <NotesCard label={t("common.notes")} notes={upgrade.notes} />

      <EditUpgradeDialog
        upgrade={upgrade}
        open={editUpgradeOpen}
        onClose={() => setEditUpgradeOpen(false)}
      />
      <OptionDialog
        upgradeId={upgradeId}
        open={optionDialogOpen}
        onClose={() => {
          setOptionDialogOpen(false);
          setEditOption(null);
        }}
        editOption={editOption ?? undefined}
      />
      <AddItemDialog
        upgradeId={upgradeId}
        open={addItemOpen || !!editItem}
        onClose={() => {
          setAddItemOpen(false);
          setEditItem(null);
        }}
        editItem={editItem ?? undefined}
      />
    </div>
  );
}
