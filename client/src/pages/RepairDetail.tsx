import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Repair = RouterOutputs["repairs"]["list"][number];
type RepairQuote = RouterOutputs["repairQuotes"]["list"][number];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Plus, Pencil, Trash2, Check, Phone, Clock, ShieldCheck, FileText } from "lucide-react";
import { formatCurrency, formatDate, asArray } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

// ── Types & constants ─────────────────────────────────────────────────────────

const STATUSES = ["open", "in_progress", "waiting_for_parts", "waiting_for_contractor", "completed"] as const;
type RepairStatus = typeof STATUSES[number];

const PRIORITY_COLOR: Record<string, string> = {
  low:    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  medium: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  high:   "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  urgent: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
};

const ils = (n: number) => Math.round(n * 100);

// ── Status stepper ────────────────────────────────────────────────────────────

function StatusStepper({ status, onChange, loading }: {
  status: string; onChange: (s: RepairStatus) => void; loading: boolean;
}) {
  const { t } = useTranslation();
  const currentIdx = STATUSES.indexOf(status as RepairStatus);
  return (
    <div className="flex items-center gap-0 flex-wrap gap-y-2">
      {STATUSES.map((s, i) => {
        const done   = i < currentIdx;
        const active = s === status;
        const isLast = i === STATUSES.length - 1;
        return (
          <div key={s} className="flex items-center">
            <button
              onClick={() => !loading && onChange(s)}
              disabled={loading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                active  && "bg-indigo-500 text-white border-indigo-500 shadow-sm",
                done    && "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50",
                !active && !done && "bg-muted text-muted-foreground border-transparent hover:border-border",
                loading && "opacity-50 cursor-wait"
              )}
            >
              {done && <Check className="h-3 w-3" />}
              {t(`status.${s}`, { defaultValue: s })}
            </button>
            {!isLast && (
              <div className={cn("h-px w-4 shrink-0", i < currentIdx ? "bg-indigo-200 dark:bg-indigo-900/50" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── QuoteDialog (add / edit) ──────────────────────────────────────────────────

function QuoteDialog({ open, onOpenChange, repairId, editQuote }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  repairId: string; editQuote?: RepairQuote;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createMut = trpc.repairQuotes.create.useMutation({ onSuccess: () => { utils.repairQuotes.list.invalidate(); onOpenChange(false); } });
  const updateMut = trpc.repairQuotes.update.useMutation({ onSuccess: () => { utils.repairQuotes.list.invalidate(); onOpenChange(false); } });

  const [f, setF] = useState({ contractorName: "", contractorPhone: "", quotedPrice: "", timeline: "", guarantee: "", scope: "", notes: "" });

  useEffect(() => {
    if (open) setF({
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
    if (!f.contractorName.trim()) { toast.error(t("repairDetail.contractorName") + " is required"); return; }
    const payload = {
      contractorName: f.contractorName.trim(),
      contractorPhone: f.contractorPhone || undefined,
      quotedPrice: f.quotedPrice ? ils(parseFloat(f.quotedPrice)) : undefined,
      timeline: f.timeline || undefined,
      guarantee: f.guarantee || undefined,
      scope: f.scope || undefined,
      notes: f.notes || undefined,
    };
    try {
      if (editQuote) await updateMut.mutateAsync({ id: editQuote.id, data: payload });
      else await createMut.mutateAsync({ repairId, ...payload });
    } catch { toast.error("Failed to save quote"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editQuote ? t("repairDetail.editQuote") : t("repairDetail.addContractorQuote")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>{t("repairDetail.contractorName")}</Label>
              <Input value={f.contractorName} onChange={e => setF(p => ({ ...p, contractorName: e.target.value }))} placeholder="e.g. Moshe Plumbing" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone")}</Label>
              <Input value={f.contractorPhone} onChange={e => setF(p => ({ ...p, contractorPhone: e.target.value }))} placeholder="050-000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("repairDetail.quotedPrice")}</Label>
              <Input type="number" min="0" value={f.quotedPrice} onChange={e => setF(p => ({ ...p, quotedPrice: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.timeline")}</Label>
              <Input value={f.timeline} onChange={e => setF(p => ({ ...p, timeline: e.target.value }))} placeholder="e.g. 2–3 days" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.guarantee")}</Label>
              <Input value={f.guarantee} onChange={e => setF(p => ({ ...p, guarantee: e.target.value }))} placeholder="e.g. 1 year parts" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.scope")}</Label>
              <Textarea rows={2} value={f.scope} onChange={e => setF(p => ({ ...p, scope: e.target.value }))} placeholder="What exactly will they fix / replace?" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>{t("common.notes")}</Label>
              <Textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              {editQuote ? t("repairDetail.saveChanges") : t("repairDetail.addQuote")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── LogPaymentDialog ──────────────────────────────────────────────────────────

function LogPaymentDialog({ open, onOpenChange, quoteId, repairId }: {
  open: boolean; onOpenChange: (v: boolean) => void; quoteId: string; repairId: string;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const logMut = trpc.repairQuotes.logPayment.useMutation({
    onSuccess: () => {
      utils.repairQuotes.list.invalidate({ repairId });
      utils.repairs.list.invalidate();
      onOpenChange(false);
      toast.success("Payment logged");
    },
  });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<{ url: string; filename: string; mimeType: string; size: number }[]>([]);

  useEffect(() => { if (!open) { setAmount(""); setDate(new Date().toISOString().split("T")[0]); setNotes(""); setReceipt([]); } }, [open]);

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) { toast.error("Enter a valid amount"); return; }
    try {
      await logMut.mutateAsync({ quoteId, amount: ils(parseFloat(amount)), date, notes: notes || undefined, receipt: receipt[0]?.url });
    } catch { toast.error("Failed to log payment"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("repairDetail.logPayment")}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("repairDetail.amountRequired")}</Label>
            <Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Deposit" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.receipt")} ({t("common.optional")})</Label>
            <FileUpload
              onUpload={f => setReceipt([f])}
              existingFiles={receipt}
              onRemove={() => setReceipt([])}
              maxFiles={1}
              accept="image/*,.pdf"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleSave} disabled={logMut.isPending}>
              {logMut.isPending && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              {t("repairDetail.logPayment")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── QuoteCard ─────────────────────────────────────────────────────────────────

function QuoteCard({ quote, repairId, onEdit }: { quote: RepairQuote; repairId: string; onEdit: () => void }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const selectMut  = trpc.repairQuotes.select.useMutation({ onSuccess: () => utils.repairQuotes.list.invalidate({ repairId }) });
  const deleteMut  = trpc.repairQuotes.delete.useMutation({ onSuccess: () => { utils.repairQuotes.list.invalidate({ repairId }); toast.success("Quote removed"); } });
  const delPayMut  = trpc.repairQuotes.deletePayment.useMutation({ onSuccess: () => { utils.repairQuotes.list.invalidate({ repairId }); utils.repairs.list.invalidate(); } });

  const [logOpen, setLogOpen] = useState(false);
  // Normalize: MariaDB may return JSON columns as strings instead of parsed arrays
  const payments = asArray(quote.payments);
  const totalPaid = (payments as { amount: number }[]).reduce((s, p) => s + p.amount, 0);

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden transition-all",
      quote.selected ? "border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-900/50" : "border-border"
    )}>
      {/* Header */}
      <div className={cn("flex items-center justify-between gap-2 px-4 py-3",
        quote.selected ? "bg-indigo-50/60 dark:bg-indigo-950/20" : "bg-muted/30"
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          {quote.selected && <Check className="h-4 w-4 text-indigo-500 shrink-0" />}
          <p className="font-semibold text-sm truncate">{quote.contractor}</p>
          {quote.selected && (
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
              {t("common.selected")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!quote.selected && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => selectMut.mutate({ repairId, quoteId: quote.id })}>
              {selectMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.select")}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm(t("repairDetail.deleteQuoteConfirm"))) deleteMut.mutate({ id: quote.id }); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-border">
        {quote.amount > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-semibold text-foreground">{formatCurrency(quote.amount, "ILS")}</span>
            {t("repairDetail.quoted")}
          </div>
        )}
        {quote.date && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />{quote.date}
          </div>
        )}
        {quote.notes && (
          <div className="col-span-2 flex items-start gap-1.5 text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />{quote.notes}
          </div>
        )}
      </div>

      {/* Payments */}
      {(payments.length > 0 || quote.selected) && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">{t("repairDetail.payments")}</p>
            {quote.selected && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setLogOpen(true)}>
                <Plus className="h-3 w-3 me-1" />{t("repairDetail.logPayment")}
              </Button>
            )}
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("repairDetail.noPayments")}</p>
          ) : (
            <div className="space-y-1">
              {(payments as { date: string; amount: number; notes?: string }[]).map((p, i) => (
                <div key={i} className="group/pay flex items-center gap-3 text-sm py-1">
                  <span className="text-muted-foreground text-xs w-20 shrink-0">{formatDate(p.date)}</span>
                  <span className="font-semibold flex-1">{formatCurrency(p.amount, "ILS")}</span>
                  {p.notes && <span className="text-xs text-muted-foreground truncate">{p.notes}</span>}
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/pay:opacity-100 text-destructive hover:text-destructive shrink-0"
                    onClick={() => delPayMut.mutate({ quoteId: quote.id, paymentIndex: i })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="pt-1 border-t border-border flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">{t("repairDetail.totalPaid")}</span>
                <span>{formatCurrency(totalPaid, "ILS")}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <LogPaymentDialog open={logOpen} onOpenChange={setLogOpen} quoteId={quote.id} repairId={repairId} />
    </div>
  );
}

// ── EditRepairDialog ──────────────────────────────────────────────────────────

function EditRepairDialog({ open, onOpenChange, repair }: { open: boolean; onOpenChange: (v: boolean) => void; repair: Repair }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const updateMut = trpc.repairs.update.useMutation({
    onSuccess: () => { utils.repairs.list.invalidate(); onOpenChange(false); toast.success("Updated"); },
  });
  const [f, setF] = useState({ title: "", description: "", priority: "medium", cost: "", notes: "" });

  useEffect(() => {
    if (open && repair) setF({
      title: repair.title ?? "",
      description: repair.description ?? "",
      priority: repair.priority ?? "medium",
      cost: repair.cost ? String(repair.cost / 100) : "",
      notes: repair.notes ?? "",
    });
  }, [open, repair?.id]);

  const save = async () => {
    if (!f.title.trim()) { toast.error("Title required"); return; }
    try {
      await updateMut.mutateAsync({ id: repair.id, data: {
        title: f.title.trim(),
        description: f.description || undefined,
        priority: f.priority as Repair["priority"],
        cost: f.cost ? ils(parseFloat(f.cost)) : undefined,
        notes: f.notes || undefined,
      }});
    } catch { toast.error("Failed to save"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("repairDetail.editRepair")}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label>{t("repairs.description")} *</Label>
            <Input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("repairs.details")}</Label>
            <Textarea rows={2} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.priority")}</Label>
              <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" value={f.priority} onChange={e => setF(p => ({ ...p, priority: e.target.value }))}>
                {["urgent","high","medium","low"].map(v => <option key={v} value={v}>{t(`priority.${v}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("upgradeDetail.estCost")}</Label>
              <Input type="number" min="0" value={f.cost} onChange={e => setF(p => ({ ...p, cost: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.notes")}</Label>
            <Textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={save} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── RepairDetail ──────────────────────────────────────────────────────────────

export default function RepairDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const utils = trpc.useUtils();

  const { data: repairsRaw, isLoading } = trpc.repairs.list.useQuery();
  const { data: quotesRaw, isLoading: quotesLoading } = trpc.repairQuotes.list.useQuery({ repairId: id! });

  // Guard against null returns from MariaDB (null ≠ undefined, so = [] default won't fire)
  const repairs = Array.isArray(repairsRaw) ? repairsRaw : [];
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [];

  const repair = useMemo(() => repairs.find(r => r.id === id), [repairs, id]);

  const updateMut = trpc.repairs.update.useMutation({
    onSuccess: () => utils.repairs.list.invalidate(),
  });

  const [quoteOpen, setQuoteOpen]     = useState(false);
  const [editQuote, setEditQuote]     = useState<RepairQuote | null>(null);
  const [editOpen, setEditOpen]       = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleStatusChange = async (status: RepairStatus) => {
    if (!repair || status === repair.status) return;
    setStatusLoading(true);
    try {
      await updateMut.mutateAsync({ id: repair.id, data: { status } });
    } catch { toast.error("Failed to update status"); }
    finally { setStatusLoading(false); }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!repair) return (
    <div className="flex flex-col items-center justify-center h-[50vh] gap-3">
      <p className="text-muted-foreground">Repair not found</p>
      <Button variant="outline" size="sm" onClick={() => nav("/repairs")}>{t("common.back")}</Button>
    </div>
  );

  const selectedQuote = quotes.find(q => q.selected);
  const totalPaid = (asArray(selectedQuote?.payments) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={() => nav("/repairs")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {t("repairs.title")}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", PRIORITY_COLOR[repair.priority as string] ?? PRIORITY_COLOR.medium)}>
                {t(`priority.${repair.priority}`)}
              </span>
              <span className="text-xs text-muted-foreground">{t("repairs.dateLogged")} {formatDate(repair.reportedDate ?? "")}</span>
              {totalPaid > 0 && (
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(totalPaid, "ILS")} {t("repairs.paidCost")}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight">{repair.title}</h1>
            {repair.description && (
              <p className="text-sm text-muted-foreground mt-1">{repair.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 me-1.5" />{t("common.edit")}
          </Button>
        </div>
      </div>

      {/* Status stepper */}
      <div className="border border-border rounded-lg p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">Progress</p>
        <div className="overflow-x-auto pb-1">
          <StatusStepper status={repair.status ?? "open"} onChange={handleStatusChange} loading={statusLoading} />
        </div>
      </div>

      {/* Quotes section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">{t("repairDetail.contractors")}</p>
            <div className="flex-1 h-px bg-border w-16" />
            {quotes.length > 0 && (
              <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                {quotes.length} {quotes.length !== 1 ? t("repairs.quotes") : t("repairs.quote")}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => { setEditQuote(null); setQuoteOpen(true); }}>
            <Plus className="h-3.5 w-3.5 me-1.5" />{t("repairDetail.addQuote")}
          </Button>
        </div>

        {quotesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : quotes.length === 0 ? (
          <div className="border border-border rounded-lg px-4 py-10 text-center">
            <p className="text-sm font-medium mb-1">{t("repairDetail.noQuotesYet")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("repairDetail.addFirstQuote")}</p>
            <Button size="sm" variant="outline" onClick={() => { setEditQuote(null); setQuoteOpen(true); }}>
              <Plus className="h-3.5 w-3.5 me-1.5" />{t("repairDetail.addQuote")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...quotes].sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0)).map(q => (
              <QuoteCard
                key={q.id}
                quote={q}
                repairId={id!}
                onEdit={() => { setEditQuote(q); setQuoteOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {repair.notes && (
        <div className="border border-border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">{t("common.notes")}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{repair.notes}</p>
        </div>
      )}

      <QuoteDialog
        open={quoteOpen}
        onOpenChange={v => { setQuoteOpen(v); if (!v) setEditQuote(null); }}
        repairId={id!}
        editQuote={editQuote ?? undefined}
      />
      <EditRepairDialog open={editOpen} onOpenChange={setEditOpen} repair={repair} />
    </div>
  );
}
