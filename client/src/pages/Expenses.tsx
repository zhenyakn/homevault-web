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
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Check, Pencil, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";
import SpendingTrendChart from "@/components/SpendingTrendChart";
import { cn } from "@/lib/utils";

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

const CAT_COLOR: Record<string, string> = {
  Maintenance:
    "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  Utilities:
    "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  Insurance:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  Tax: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  Management: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  Renovation:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  Loan: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  Other: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// Local YYYY-MM (not UTC) so it lines up with the locally-entered expense date
// strings ("YYYY-MM-DD"); toISOString() would shift across the month boundary in
// non-UTC zones and default to a month with no data.
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

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

export default function Expenses() {
  const { t } = useTranslation();
  const { data: expenses, isLoading, refetch } = trpc.expenses.list.useQuery();
  const { data: loans } = trpc.loans.list.useQuery();
  const createMutation = trpc.expenses.create.useMutation();
  const updateMutation = trpc.expenses.update.useMutation();
  const deleteMutation = trpc.expenses.delete.useMutation();
  const markPaidMutation = trpc.expenses.markAsPaid.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(currentMonthKey);
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
      (e.attachments || []).map((url: string) => ({
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
        loanId:
          form.category === "Loan" && form.loanId ? form.loanId : null,
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

  // Distinct YYYY-MM present in the data, newest first, plus the current month
  // so the default selection is always offered even before any expense exists.
  const monthOptions = useMemo(() => {
    const months = new Set<string>([currentMonthKey()]);
    for (const e of expenses ?? []) months.add(e.date.slice(0, 7));
    return Array.from(months).sort().reverse();
  }, [expenses]);

  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });

  const filtered = useMemo(() => {
    if (!expenses) return [];
    const base = expenses.filter(
      e =>
        (categoryFilter === "all" || e.category === categoryFilter) &&
        (monthFilter === "all" || e.date.slice(0, 7) === monthFilter)
    );
    return [...base].sort((a, b) => {
      const aPaid = !!a.isPaid;
      const bPaid = !!b.isPaid;
      if (aPaid === bPaid)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      return aPaid ? 1 : -1;
    });
  }, [expenses, categoryFilter, monthFilter]);

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

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const monthly = filtered
    .filter(e => e.isRecurring)
    .reduce((s, e) => s + e.amount, 0);
  const paidCount = filtered.filter(e => e.isPaid).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("expenses.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 me-1.5" />
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
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 me-1.5" />
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
                      onChange={e => setForm({ ...form, date: e.target.value })}
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
                    className="font-normal cursor-pointer"
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
                          recurringInterval: v as (typeof FREQUENCIES)[number],
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
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder={t("common.optional")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.attachments")}</Label>
                  <FileUpload
                    onUpload={f => setAttachments([...attachments, f])}
                    existingFiles={attachments}
                    onRemove={i =>
                      setAttachments(attachments.filter((_, idx) => idx !== i))
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
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-border rounded-lg divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
        {[
          { label: t("expenses.total"), value: formatCurrency(total) },
          {
            label: t("expenses.recurringPerMonth"),
            value: formatCurrency(monthly),
          },
          { label: t("common.entries"), value: String(filtered.length) },
          {
            label: t("expenses.paid"),
            value: `${paidCount} / ${filtered.length}`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Spending trend */}
      <SpendingTrendChart expenses={expenses ?? []} />

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allTime")}</SelectItem>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder={t("expenses.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allCategories")}</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {t(`categories.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoryFilter !== "all" && (
          <button
            onClick={() => setCategoryFilter("all")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common.clearFilter")} ×
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {categoryFilter !== "all" || monthFilter !== "all"
              ? t("expenses.noMatchingExpenses")
              : t("expenses.noExpenses")}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {filtered.map((expense, idx) => {
            const isPaid = !!expense.isPaid;
            const prevPaid = idx > 0 && !!filtered[idx - 1].isPaid;
            const showDivider =
              isPaid && !prevPaid && filtered.some(e => !e.isPaid);
            return (
              <div key={expense.id}>
                {showDivider && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/20">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
                      {t("expenses.paid")}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div
                  className={cn(
                    "flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors",
                    isPaid && "opacity-60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isPaid && "text-muted-foreground"
                        )}
                      >
                        {expense.name}
                      </p>
                      <Badge
                        className={cn(
                          "text-xs h-5 border-0",
                          CAT_COLOR[expense.category ?? ""] ?? CAT_COLOR.Other
                        )}
                      >
                        {t(`categories.${expense.category}`, {
                          defaultValue: expense.category,
                        })}
                      </Badge>
                      {expense.isRecurring && (
                        <span className="text-xs text-muted-foreground">
                          {t(`frequency.${expense.recurringInterval}`, {
                            defaultValue: expense.recurringInterval,
                          })}
                        </span>
                      )}
                      {expense.loanId && (
                        <span className="text-xs text-muted-foreground">
                          {t("expenses.repaysLoan", {
                            loan:
                              loans?.find(l => l.id === expense.loanId)
                                ?.lender ?? t("expenses.aLoan"),
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(expense.date)}
                      {expense.notes && ` · ${expense.notes}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-end me-2">
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        isPaid && "text-muted-foreground"
                      )}
                    >
                      {formatCurrency(expense.amount)}
                    </p>
                    {isPaid && (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center justify-end gap-1 mt-0.5">
                        <Check className="h-3 w-3" />
                        {t("expenses.paid")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!isPaid && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        title={t("expenses.markPaid")}
                        aria-label={t("expenses.markPaidNamed", {
                          name: expense.name,
                        })}
                        onClick={() => handleMarkPaid(expense.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleEdit(expense)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(expense.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
