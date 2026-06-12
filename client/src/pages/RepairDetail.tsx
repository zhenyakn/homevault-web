import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Repair = RouterOutputs["repairs"]["list"][number];
type RepairQuote = RouterOutputs["repairQuotes"]["list"][number];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  Clock,
  FileText,
} from "lucide-react";
import { formatCurrency, formatDate, asArray, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DetailHeader,
  StatusStepperCard,
  DetailSectionHeader,
  DetailSummaryCard,
  NotesCard,
  CollapsibleCard,
} from "@/components/DetailPage";
import { LogPaymentDialog } from "@/components/LogPaymentDialog";
import { priorityBadgeClass } from "@/lib/badges";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  "open",
  "in_progress",
  "waiting_for_parts",
  "waiting_for_contractor",
  "completed",
] as const;
type RepairStatus = (typeof STATUSES)[number];

const ils = (n: number) => Math.round(n * 100);

// ── QuoteDialog (add / edit) ─────────────────────────────────────────────────

function QuoteDialog({
  open,
  onOpenChange,
  repairId,
  editQuote,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repairId: string;
  editQuote?: RepairQuote;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMut = trpc.repairQuotes.create.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate();
      onOpenChange(false);
    },
  });
  const updateMut = trpc.repairQuotes.update.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate();
      onOpenChange(false);
    },
  });

  const [f, setF] = useState({
    contractorName: "",
    contractorPhone: "",
    quotedPrice: "",
    timeline: "",
    guarantee: "",
    scope: "",
    notes: "",
  });

  useEffect(() => {
    if (open)
      setF({
        contractorName: editQuote?.contractor ?? "",
        contractorPhone: "",
        quotedPrice: editQuote?.amount ? String(editQuote.amount / 100) : "",
        timeline: "",
        guarantee: "",
        scope: "",
        notes: editQuote?.notes ?? "",
      });
  }, [open, editQuote?.id]);

  const busy = createMut.isPending || updateMut.isPending;

  const handleSave = async () => {
    if (!f.contractorName.trim()) {
      toast.error(t("repairDetail.contractorName") + " is required");
      return;
    }
    // Phone/timeline/guarantee/scope have no DB columns — fold into notes so
    // user-entered context is preserved instead of silently dropped.
    const extras = [
      f.contractorPhone && `${t("common.phone")}: ${f.contractorPhone}`,
      f.timeline && `${t("common.timeline")}: ${f.timeline}`,
      f.guarantee && `${t("common.guarantee")}: ${f.guarantee}`,
      f.scope && `${t("common.scope")}: ${f.scope}`,
    ]
      .filter(Boolean)
      .join("\n");
    const combinedNotes =
      [extras, f.notes].filter(Boolean).join("\n\n") || undefined;
    const payload = {
      contractor: f.contractorName.trim(),
      amount: f.quotedPrice ? ils(parseFloat(f.quotedPrice)) : undefined,
      notes: combinedNotes,
    };
    try {
      if (editQuote)
        await updateMut.mutateAsync({ id: editQuote.id, data: payload });
      else await createMut.mutateAsync({ repairId, ...payload });
    } catch {
      toast.error(t("repairDetail.failedSaveQuote"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editQuote
              ? t("repairDetail.editQuote")
              : t("repairDetail.addContractorQuote")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="quote-contractor">
                {t("repairDetail.contractorName")}
              </Label>
              <Input
                id="quote-contractor"
                value={f.contractorName}
                onChange={e =>
                  setF(p => ({ ...p, contractorName: e.target.value }))
                }
                placeholder="e.g. Moshe Plumbing"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input
                value={f.contractorPhone}
                onChange={e =>
                  setF(p => ({ ...p, contractorPhone: e.target.value }))
                }
                placeholder="050-000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("repairDetail.quotedPrice")}</Label>
              <Input
                type="number"
                min="0"
                value={f.quotedPrice}
                onChange={e =>
                  setF(p => ({ ...p, quotedPrice: e.target.value }))
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.timeline")}</Label>
              <Input
                value={f.timeline}
                onChange={e => setF(p => ({ ...p, timeline: e.target.value }))}
                placeholder="e.g. 2–3 days"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.guarantee")}</Label>
              <Input
                value={f.guarantee}
                onChange={e => setF(p => ({ ...p, guarantee: e.target.value }))}
                placeholder="e.g. 1 year parts"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.scope")}</Label>
              <Textarea
                rows={2}
                value={f.scope}
                onChange={e => setF(p => ({ ...p, scope: e.target.value }))}
                placeholder="What exactly will they fix / replace?"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.notes")}</Label>
              <Textarea
                rows={2}
                value={f.notes}
                onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              {editQuote
                ? t("repairDetail.saveChanges")
                : t("repairDetail.addQuote")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── QuoteCard ────────────────────────────────────────────────────────────────

function QuoteCard({
  quote,
  repairId,
  onEdit,
}: {
  quote: RepairQuote;
  repairId: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const selectMut = trpc.repairQuotes.select.useMutation({
    onSuccess: () => utils.repairQuotes.list.invalidate({ repairId }),
  });
  const deleteMut = trpc.repairQuotes.delete.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate({ repairId });
      toast.success(t("repairDetail.quoteRemoved"));
    },
  });
  const delPayMut = trpc.repairQuotes.deletePayment.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate({ repairId });
      utils.repairs.list.invalidate();
    },
  });
  const logMut = trpc.repairQuotes.logPayment.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate({ repairId });
      utils.repairs.list.invalidate();
      setLogOpen(false);
      toast.success(t("repairDetail.paymentLogged"));
    },
  });

  const [logOpen, setLogOpen] = useState(false);
  const payments = asArray(quote.payments) as {
    id: string;
    date: string;
    amount: number;
    notes?: string;
  }[];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  const header = (
    <>
      {quote.selected && <Check className="h-4 w-4 text-indigo-500 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{quote.contractor}</p>
          {quote.selected && (
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
              {t("common.selected")}
            </span>
          )}
        </div>
        {quote.amount > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {formatCurrency(quote.amount)} {t("repairDetail.quoted")}
          </p>
        )}
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
      title={t("repairDetail.editQuote")}
    >
      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );

  return (
    <CollapsibleCard
      header={header}
      headerActions={headerActions}
      selected={quote.selected ?? false}
      defaultExpanded={quote.selected ?? false}
    >
      <div className="px-4 py-3 space-y-3">
        {/* Selected bar */}
        {quote.selected && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("common.selected")}</span>
            <span className="tabular-nums">
              {t("upgradeDetail.paidLabel")}{" "}
              <span className="text-foreground font-semibold">
                {formatCurrency(totalPaid)}
              </span>
              {quote.amount > 0 ? ` / ${formatCurrency(quote.amount)}` : ""}
            </span>
          </div>
        )}

        {/* Details */}
        {(quote.date || quote.notes) && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {quote.date && (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {formatDate(quote.date)}
              </div>
            )}
            {quote.notes && (
              <div className="col-span-2 flex items-start gap-1.5 text-muted-foreground text-xs whitespace-pre-wrap">
                <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {quote.notes}
              </div>
            )}
          </div>
        )}

        {/* Payments */}
        {(payments.length > 0 || quote.selected) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("repairDetail.payments")}
              </p>
              {quote.selected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setLogOpen(true)}
                >
                  <Plus className="h-3 w-3 me-1" />
                  {t("repairDetail.logPayment")}
                </Button>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("repairDetail.noPayments")}
              </p>
            ) : (
              <div className="space-y-1">
                {payments.map(p => (
                  <div
                    key={p.id}
                    className="group/pay flex items-center justify-between text-xs gap-2"
                  >
                    <span className="text-muted-foreground truncate">
                      {formatDate(p.date)}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="tabular-nums font-medium">
                        {formatCurrency(p.amount)}
                      </span>
                      <button
                        type="button"
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover/pay:opacity-100 transition-opacity"
                        onClick={() =>
                          delPayMut.mutate({
                            quoteId: quote.id,
                            paymentId: p.id,
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-1 border-t border-border flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    {t("repairDetail.totalPaid")}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex gap-2 flex-wrap">
          {!quote.selected && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={selectMut.isPending}
              onClick={() => selectMut.mutate({ repairId, quoteId: quote.id })}
            >
              <Check className="h-3 w-3 me-1" />
              {t("common.select")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-7 w-7 p-0 text-destructive hover:text-destructive",
              quote.selected && "ms-auto"
            )}
            disabled={deleteMut.isPending}
            onClick={() => {
              if (confirm(t("repairDetail.deleteQuoteConfirm")))
                deleteMut.mutate({ id: quote.id });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <LogPaymentDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title={t("repairDetail.logPayment")}
        amountLabel={t("repairDetail.amountRequired")}
        submitLabel={t("repairDetail.logPayment")}
        isPending={logMut.isPending}
        onSubmit={async values => {
          await logMut.mutateAsync({ quoteId: quote.id, ...values });
        }}
      />
    </CollapsibleCard>
  );
}

// ── EditRepairDialog ─────────────────────────────────────────────────────────

function EditRepairDialog({
  open,
  onOpenChange,
  repair,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  repair: Repair;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const updateMut = trpc.repairs.update.useMutation({
    onSuccess: () => {
      utils.repairs.list.invalidate();
      onOpenChange(false);
      toast.success(t("repairDetail.updated"));
    },
  });
  const [f, setF] = useState({
    title: "",
    description: "",
    priority: "medium",
    cost: "",
    notes: "",
  });

  useEffect(() => {
    if (open && repair)
      setF({
        title: repair.title ?? "",
        description: repair.description ?? "",
        priority: repair.priority ?? "medium",
        cost: repair.cost ? String(repair.cost / 100) : "",
        notes: repair.notes ?? "",
      });
  }, [open, repair?.id]);

  const save = async () => {
    if (!f.title.trim()) {
      toast.error(t("repairDetail.titleRequired"));
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: repair.id,
        data: {
          title: f.title.trim(),
          description: f.description || undefined,
          priority: f.priority as Repair["priority"],
          cost: f.cost ? ils(parseFloat(f.cost)) : undefined,
          notes: f.notes || undefined,
        },
      });
    } catch {
      toast.error(t("common.failedSave"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("repairDetail.editRepair")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("repairs.description")} *</Label>
            <Input
              value={f.title}
              onChange={e => setF(p => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("repairs.details")}</Label>
            <Textarea
              rows={2}
              value={f.description}
              onChange={e => setF(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.priority")}</Label>
              <select
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                value={f.priority}
                onChange={e => setF(p => ({ ...p, priority: e.target.value }))}
              >
                {["urgent", "high", "medium", "low"].map(v => (
                  <option key={v} value={v}>
                    {t(`priority.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.estCost")}</Label>
              <Input
                type="number"
                min="0"
                value={f.cost}
                onChange={e => setF(p => ({ ...p, cost: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea
              rows={2}
              value={f.notes}
              onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={save} disabled={updateMut.isPending}>
              {updateMut.isPending && (
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

// ── RepairDetail ─────────────────────────────────────────────────────────────

export default function RepairDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const utils = trpc.useUtils();

  const { data: repairsRaw, isLoading } = trpc.repairs.list.useQuery();
  const { data: quotesRaw, isLoading: quotesLoading } =
    trpc.repairQuotes.list.useQuery({ repairId: id! });

  // Guard against null returns from MariaDB (null ≠ undefined, so = [] default won't fire)
  const repairs = Array.isArray(repairsRaw) ? repairsRaw : [];
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [];

  const repair = useMemo(() => repairs.find(r => r.id === id), [repairs, id]);

  const updateMut = trpc.repairs.update.useMutation({
    onSuccess: () => utils.repairs.list.invalidate(),
  });

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<RepairQuote | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleStatusChange = async (status: string) => {
    if (!repair || status === repair.status) return;
    setStatusLoading(true);
    try {
      await updateMut.mutateAsync({
        id: repair.id,
        data: { status: status as RepairStatus },
      });
    } catch {
      toast.error(t("repairDetail.failedUpdateStatus"));
    } finally {
      setStatusLoading(false);
    }
  };

  // Once the list has loaded and this id isn't in it (e.g. after switching
  // property), recover to the list instead of dead-ending on a 404.
  const missing = !isLoading && !repair;
  useEffect(() => {
    if (missing) nav("/repairs", { replace: true });
  }, [missing, nav]);

  if (isLoading || !repair)
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  const selectedQuote = quotes.find(q => q.selected);
  const totalPaid = (
    asArray(selectedQuote?.payments) as { amount: number }[]
  ).reduce((s, p) => s + p.amount, 0);
  const quotedAmount = selectedQuote?.amount ?? 0;
  const summaryProgress =
    quotedAmount > 0 ? (totalPaid / quotedAmount) * 100 : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <DetailHeader
        backLabel={t("repairs.title")}
        onBack={() => nav("/repairs")}
        title={repair.title}
        description={repair.description}
        editLabel={t("common.edit")}
        onEdit={() => setEditOpen(true)}
        meta={
          <>
            <Badge
              className={cn(
                "text-xs h-5 border-0 shrink-0",
                priorityBadgeClass(repair.priority)
              )}
            >
              {t(`priority.${repair.priority}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("repairs.dateLogged")} {formatDate(repair.reportedDate ?? "")}
            </span>
          </>
        }
      />

      <StatusStepperCard
        label={t("common.progress")}
        steps={STATUSES}
        currentStatus={repair.status ?? "open"}
        onChange={handleStatusChange}
        loading={statusLoading}
        getStepLabel={s => t(`status.${s}`, { defaultValue: s })}
      />

      {selectedQuote && (
        <DetailSummaryCard
          stats={[
            {
              value: formatCurrency(quotedAmount),
              label: t("repairDetail.quoted"),
              sub: selectedQuote.contractor,
            },
            {
              value: formatCurrency(totalPaid),
              label: t("dashboard.paid"),
            },
          ]}
          progress={summaryProgress}
          progressLeft={t("upgradeDetail.budgetUsed", {
            pct: Math.round(summaryProgress),
          })}
          progressRight={`${formatCurrency(totalPaid)} ${t("dashboard.paid")}`}
        />
      )}

      <div>
        <DetailSectionHeader
          label={t("repairDetail.contractors")}
          count={quotes.length}
          countSuffix={
            quotes.length !== 1 ? t("repairs.quotes") : t("repairs.quote")
          }
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditQuote(null);
                setQuoteOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 me-1.5" />
              {t("repairDetail.addQuote")}
            </Button>
          }
        />

        {quotesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="border border-border rounded-lg px-4 py-10 text-center">
            <p className="text-sm font-medium mb-1">
              {t("repairDetail.noQuotesYet")}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {t("repairDetail.addFirstQuote")}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditQuote(null);
                setQuoteOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 me-1.5" />
              {t("repairDetail.addQuote")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...quotes]
              .sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0))
              .map(q => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  repairId={id!}
                  onEdit={() => {
                    setEditQuote(q);
                    setQuoteOpen(true);
                  }}
                />
              ))}
          </div>
        )}
      </div>

      <NotesCard label={t("common.notes")} notes={repair.notes} />

      <QuoteDialog
        open={quoteOpen}
        onOpenChange={v => {
          setQuoteOpen(v);
          if (!v) setEditQuote(null);
        }}
        repairId={id!}
        editQuote={editQuote ?? undefined}
      />
      <EditRepairDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        repair={repair}
      />
    </div>
  );
}
