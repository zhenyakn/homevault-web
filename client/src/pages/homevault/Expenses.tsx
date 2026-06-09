import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type Expense = RouterOutputs["expenses"]["list"][number];

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  Pencil,
  Download,
  Search,
  Receipt,
  Repeat,
  AlertCircle,
  CalendarDays,
} from "lucide-react";
import { asArray, formatCurrency, formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";
import {
  HVCard,
  MetricCard,
  ExpenseRow,
  HVPageHeader,
  type ExpenseStatus,
  type ReceiptStatus,
} from "@/components/homevault";

const CATEGORIES = [
  "Maintenance",
  "Utilities",
  "Insurance",
  "Tax",
  "Management",
  "Renovation",
  "Loan",
  "Other",
] as const;
const FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;

type FilterView = "all" | "unpaid" | "recurring" | "receipts" | "month";

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const hasReceipt = (e: Expense) => asArray<string>(e.attachments).length > 0;

function expenseStatus(e: Expense): ExpenseStatus {
  if (e.isPaid) return "paid";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${e.date}T00:00:00`);
  if (due < today) return "overdue";
  if (due > today) return "upcoming";
  return "unpaid";
}

const emptyForm = () => ({
  name: "",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  category: "Maintenance" as (typeof CATEGORIES)[number],
  isRecurring: false,
  recurringInterval: "monthly" as (typeof FREQUENCIES)[number],
  notes: "",
  loanId: "",
});

export default function HVExpenses() {
  const { t } = useTranslation();
  const { data: expenses, isLoading, refetch } = trpc.expenses.list.useQuery();
  const { data: loans } = trpc.loans.list.useQuery();
  const createMutation = trpc.expenses.create.useMutation();
  const updateMutation = trpc.expenses.update.useMutation();
  const deleteMutation = trpc.expenses.delete.useMutation();
  const markPaidMutation = trpc.expenses.markAsPaid.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<FilterView>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [attachments, setAttachments] = useState<
    { url: string; filename: string; mimeType: string; size: number }[]
  >([]);

  const reset = () => {
    setForm(emptyForm());
    setAttachments([]);
    setEditingId(null);
  };

  const handleEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      amount: String(e.amount / 100),
      date: e.date,
      category: (e.category ?? "Maintenance") as (typeof CATEGORIES)[number],
      isRecurring: e.isRecurring || false,
      recurringInterval: e.recurringInterval || "monthly",
      notes: e.notes || "",
      loanId: e.loanId || "",
    });
    setAttachments(
      asArray<string>(e.attachments).map((url: string) => ({
        url,
        filename: url.split("/").pop() || "file",
        mimeType: "application/octet-stream",
        size: 0,
      }))
    );
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.amount) {
      toast.error(
        t("common.description") + " and " + t("common.amount") + " are required"
      );
      return;
    }
    try {
      const payload = {
        ...form,
        amount: Math.round(parseFloat(form.amount) * 100),
        attachments: attachments.map(a => a.url),
        loanId: form.category === "Loan" && form.loanId ? form.loanId : null,
      };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        toast.success(t("expenses.editExpense"));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t("expenses.addExpense"));
      }
      setOpen(false);
      reset();
      refetch();
    } catch {
      toast.error(t("expenses.failedSave"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("expenses.deleteConfirm"))) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success(t("expenses.deleted"));
      refetch();
    } catch {
      toast.error(t("expenses.failedDelete"));
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await markPaidMutation.mutateAsync({
        id,
        paidDate: new Date().toISOString().split("T")[0],
      });
      toast.success(t("expenses.markPaid"));
      refetch();
    } catch {
      toast.error(t("expenses.failedMarkPaid"));
    }
  };

  const monthKey = currentMonthKey();

  // KPI figures across all expenses (independent of the active filter).
  const kpis = useMemo(() => {
    const all = expenses ?? [];
    const thisMonth = all
      .filter(e => e.date.slice(0, 7) === monthKey)
      .reduce((s, e) => s + e.amount, 0);
    const recurring = all
      .filter(e => e.isRecurring)
      .reduce((s, e) => {
        const i = e.recurringInterval || "monthly";
        if (i === "yearly") return s + e.amount / 12;
        if (i === "quarterly") return s + e.amount / 3;
        return s + e.amount;
      }, 0);
    const unpaid = all.filter(e => !e.isPaid).reduce((s, e) => s + e.amount, 0);
    const receiptsMissing = all.filter(e => !hasReceipt(e)).length;
    return { thisMonth, recurring, unpaid, receiptsMissing };
  }, [expenses, monthKey]);

  const filtered = useMemo(() => {
    if (!expenses) return [];
    const q = search.trim().toLowerCase();
    const base = expenses.filter(e => {
      if (
        q &&
        !(
          e.name.toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q) ||
          (e.category ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      if (view === "unpaid") return !e.isPaid;
      if (view === "recurring") return e.isRecurring;
      if (view === "receipts") return !hasReceipt(e);
      if (view === "month") return e.date.slice(0, 7) === monthKey;
      return true;
    });
    return [...base].sort((a, b) => {
      const aPaid = !!a.isPaid;
      const bPaid = !!b.isPaid;
      if (aPaid === bPaid)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      return aPaid ? 1 : -1;
    });
  }, [expenses, view, search, monthKey]);

  const handleExportCSV = () => {
    if (!filtered.length) {
      toast.error(t("expenses.nothingToExport"));
      return;
    }
    const rows = filtered.map(e => [
      e.name,
      (e.amount / 100).toFixed(2),
      e.date,
      e.category,
      e.isRecurring ? "Yes" : "No",
      e.recurringInterval || "",
      e.isPaid ? "Yes" : "No",
      e.notes || "",
    ]);
    const csv = [
      [
        "Description",
        "Amount",
        "Date",
        "Category",
        "Recurring",
        "Frequency",
        "Paid",
        "Notes",
      ],
      ...rows,
    ]
      .map(r => r.map(c => `"${c}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `expenses_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success(t("expenses.exported"));
  };

  const FILTERS: { key: FilterView; label: string }[] = [
    { key: "all", label: t("homevault.filters.all") },
    { key: "unpaid", label: t("homevault.filters.unpaid") },
    { key: "recurring", label: t("homevault.filters.recurring") },
    { key: "receipts", label: t("homevault.filters.receiptsMissing") },
    { key: "month", label: t("homevault.filters.thisMonth") },
  ];

  if (isLoading)
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-hv-muted-soft" />
      </div>
    );

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Header */}
      <HVPageHeader
        title={t("nav.expenses")}
        subtitle={t("homevault.expensesSubtitle")}
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
            <Dialog
              open={open}
              onOpenChange={v => {
                setOpen(v);
                if (!v) reset();
              }}
            >
              <DialogTrigger asChild>
                <Button className="h-11 rounded-full px-[18px]">
                  <Plus className="me-1.5 h-4 w-4" />
                  {t("expenses.addExpense")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingId
                      ? t("expenses.editExpense")
                      : t("expenses.addExpense")}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-label">{t("common.description")}</Label>
                    <Input
                      id="ex-label"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder={t("expenses.placeholderLabel")}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-amount">{t("common.amount")}</Label>
                      <Input
                        id="ex-amount"
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={e =>
                          setForm({ ...form, amount: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex-date">{t("common.date")}</Label>
                      <Input
                        id="ex-date"
                        type="date"
                        value={form.date}
                        onChange={e =>
                          setForm({ ...form, date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.category")}</Label>
                    <Select
                      value={form.category}
                      onValueChange={v =>
                        setForm({
                          ...form,
                          category: v as (typeof CATEGORIES)[number],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>
                            {t(`categories.${c}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.category === "Loan" && (
                    <div className="space-y-1.5">
                      <Label>{t("expenses.linkedLoan")}</Label>
                      <Select
                        value={form.loanId || "none"}
                        onValueChange={v =>
                          setForm({ ...form, loanId: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t("expenses.noLoanLink")}
                          </SelectItem>
                          {(loans ?? []).map(l => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.lender || l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("expenses.linkedLoanHint")}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="ex-rec"
                      checked={form.isRecurring}
                      onCheckedChange={v =>
                        setForm({ ...form, isRecurring: v as boolean })
                      }
                    />
                    <Label
                      htmlFor="ex-rec"
                      className="cursor-pointer font-normal"
                    >
                      {t("expenses.recurringExpense")}
                    </Label>
                  </div>
                  {form.isRecurring && (
                    <div className="space-y-1.5">
                      <Label>{t("common.frequency")}</Label>
                      <Select
                        value={form.recurringInterval}
                        onValueChange={v =>
                          setForm({
                            ...form,
                            recurringInterval:
                              v as (typeof FREQUENCIES)[number],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCIES.map(f => (
                            <SelectItem key={f} value={f}>
                              {t(`frequency.${f}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-notes">{t("common.notes")}</Label>
                    <Input
                      id="ex-notes"
                      value={form.notes}
                      onChange={e =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder={t("common.optional")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.attachments")}</Label>
                    <FileUpload
                      onUpload={f => setAttachments([...attachments, f])}
                      existingFiles={attachments}
                      onRemove={i =>
                        setAttachments(
                          attachments.filter((_, idx) => idx !== i)
                        )
                      }
                      accept="image/*,.pdf,.doc,.docx"
                    />
                  </div>
                  <Button onClick={handleSubmit} className="w-full">
                    {editingId ? t("common.update") : t("expenses.addExpense")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label={t("homevault.thisMonth")}
          value={formatCurrency(kpis.thisMonth)}
        />
        <MetricCard
          label={t("expenses.monthlyRecurring")}
          value={formatCurrency(kpis.recurring)}
          tone="blue"
        />
        <MetricCard
          label={t("expenses.unpaid")}
          value={formatCurrency(kpis.unpaid)}
          tone={kpis.unpaid > 0 ? "orange" : "neutral"}
        />
        <MetricCard
          label={t("homevault.receiptsMissing")}
          value={kpis.receiptsMissing}
          tone={kpis.receiptsMissing > 0 ? "red" : "green"}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setView(f.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              view === f.key
                ? "border-hv-primary bg-hv-primary text-white"
                : "border-hv-border bg-hv-surface text-hv-muted hover:bg-hv-surface-muted"
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="relative ms-auto min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-hv-muted-soft" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("expenses.searchPlaceholder")}
            className="h-9 ps-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <HVCard>
          <p className="py-10 text-center text-[13px] text-hv-muted">
            {search.trim() !== "" || view !== "all"
              ? t("expenses.noMatchingExpenses")
              : t("expenses.noExpenses")}
          </p>
        </HVCard>
      ) : (
        <HVCard flush>
          {filtered.map(e => {
            const status = expenseStatus(e);
            const receipt: ReceiptStatus = hasReceipt(e)
              ? "uploaded"
              : "missing";
            return (
              <ExpenseRow
                key={e.id}
                label={e.name}
                category={t(`categories.${e.category}`, {
                  defaultValue: e.category ?? "",
                })}
                dueLabel={formatDate(e.date)}
                amount={formatCurrency(e.amount)}
                status={status}
                receiptStatus={receipt}
                onClick={() => handleEdit(e)}
                action={
                  <div
                    className="flex items-center gap-1"
                    onClick={ev => ev.stopPropagation()}
                  >
                    {!e.isPaid && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        title={t("expenses.markPaid")}
                        onClick={() => handleMarkPaid(e.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleEdit(e)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                }
              />
            );
          })}
        </HVCard>
      )}
    </div>
  );
}
