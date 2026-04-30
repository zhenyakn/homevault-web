import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Check, Pencil, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Mortgage", "Utility", "Insurance", "Tax", "Maintenance", "Other"] as const;
const FREQUENCIES = ["Monthly", "Quarterly", "Annual"] as const;

const CAT_COLOR: Record<string, string> = {
  Mortgage: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  Utility: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  Insurance: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  Tax: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  Maintenance: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  Other: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const emptyForm = () => ({
  label: "", amount: "",
  date: new Date().toISOString().split("T")[0],
  category: "Maintenance" as typeof CATEGORIES[number],
  isRecurring: false,
  recurringFrequency: "Monthly" as typeof FREQUENCIES[number],
  notes: "",
});

export default function Expenses() {
  const { t } = useTranslation();
  const { data: expenses, isLoading, refetch } = trpc.expenses.list.useQuery();
  const createMutation = trpc.expenses.create.useMutation();
  const updateMutation = trpc.expenses.update.useMutation();
  const deleteMutation = trpc.expenses.delete.useMutation();
  const markPaidMutation = trpc.expenses.markAsPaid.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState(emptyForm());
  const [attachments, setAttachments] = useState<any[]>([]);

  const reset = () => { setForm(emptyForm()); setAttachments([]); setEditingId(null); };

  const handleEdit = (e: any) => {
    setEditingId(e.id);
    setForm({ label: e.label, amount: String(e.amount / 100), date: e.date, category: e.category, isRecurring: e.isRecurring || false, recurringFrequency: e.recurringFrequency || "Monthly", notes: e.notes || "" });
    setAttachments((e.attachments || []).map((url: string) => ({ url, filename: url.split("/").pop() || "file", mimeType: "application/octet-stream", size: 0 })));
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.label || !form.amount) { toast.error(t("common.description") + " and " + t("common.amount") + " are required"); return; }
    try {
      const payload = { ...form, amount: Math.round(parseFloat(form.amount) * 100), attachments: attachments.map(a => a.url) };
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, data: payload }); toast.success(t("expenses.editExpense")); }
      else { await createMutation.mutateAsync(payload); toast.success(t("expenses.addExpense")); }
      setOpen(false); reset(); refetch();
    } catch { toast.error(t("expenses.failedSave")); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("expenses.deleteConfirm"))) return;
    try { await deleteMutation.mutateAsync({ id }); toast.success(t("expenses.deleted")); refetch(); }
    catch { toast.error(t("expenses.failedDelete")); }
  };

  const handleMarkPaid = async (id: string) => {
    try { await markPaidMutation.mutateAsync({ id, paidDate: new Date().toISOString().split("T")[0] }); toast.success(t("expenses.markPaid")); refetch(); }
    catch { toast.error(t("expenses.failedMarkPaid")); }
  };

  const filtered = useMemo(() => {
    if (!expenses) return [];
    return categoryFilter === "all" ? expenses : expenses.filter((e: any) => e.category === categoryFilter);
  }, [expenses, categoryFilter]);

  const handleExportCSV = () => {
    if (!filtered.length) { toast.error(t("expenses.nothingToExport")); return; }
    const rows = filtered.map((e: any) => [e.label, (e.amount/100).toFixed(2), e.date, e.category, e.isRecurring?"Yes":"No", e.recurringFrequency||"", e.isPaid?"Yes":"No", e.notes||""]);
    const csv = [["Description","Amount","Date","Category","Recurring","Frequency","Paid","Notes"], ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `expenses_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    toast.success(t("expenses.exported"));
  };

  if (isLoading) return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  const total = filtered.reduce((s: number, e: any) => s + e.amount, 0);
  const monthly = filtered.filter((e: any) => e.isRecurring).reduce((s: number, e: any) => s + e.amount, 0);
  const paidCount = filtered.filter((e: any) => e.isPaid).length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("expenses.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 me-1.5" />{t("common.exportCsv")}
          </Button>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 me-1.5" />{t("expenses.addExpense")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? t("expenses.editExpense") : t("expenses.addExpense")}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="ex-label">{t("common.description")}</Label>
                  <Input id="ex-label" value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder={t("expenses.placeholderLabel")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-amount">{t("common.amount")}</Label>
                    <Input id="ex-amount" type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-date">{t("common.date")}</Label>
                    <Input id="ex-date" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.category")}</Label>
                  <Select value={form.category} onValueChange={(v: any) => setForm({...form, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`categories.${c}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="ex-rec" checked={form.isRecurring} onCheckedChange={v => setForm({...form, isRecurring: v as boolean})} />
                  <Label htmlFor="ex-rec" className="font-normal cursor-pointer">{t("expenses.recurringExpense")}</Label>
                </div>
                {form.isRecurring && (
                  <div className="space-y-1.5">
                    <Label>{t("common.frequency")}</Label>
                    <Select value={form.recurringFrequency} onValueChange={(v: any) => setForm({...form, recurringFrequency: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{t(`frequency.${f}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="ex-notes">{t("common.notes")}</Label>
                  <Input id="ex-notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder={t("common.optional")} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.attachments")}</Label>
                  <FileUpload onUpload={f => setAttachments([...attachments, f])} existingFiles={attachments} onRemove={i => setAttachments(attachments.filter((_, idx) => idx !== i))} accept="image/*,.pdf,.doc,.docx" />
                </div>
                <Button onClick={handleSubmit} className="w-full">{editingId ? t("common.update") : t("expenses.addExpense")}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-border rounded-lg divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
        {[
          { label: t("expenses.total"),          value: formatCurrency(total) },
          { label: t("expenses.recurringPerMonth"), value: formatCurrency(monthly) },
          { label: t("common.entries"),          value: String(filtered.length) },
          { label: t("expenses.paid"),           value: `${paidCount} / ${filtered.length}` },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder={t("expenses.allCategories")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allCategories")}</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`categories.${c}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        {categoryFilter !== "all" && (
          <button onClick={() => setCategoryFilter("all")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("common.clearFilter")} ×
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {categoryFilter !== "all" ? t("expenses.noCategoryExpenses") : t("expenses.noExpenses")}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {filtered.map((expense: any) => (
            <div key={expense.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{expense.label}</p>
                  <Badge className={cn("text-xs h-5 border-0", CAT_COLOR[expense.category] ?? CAT_COLOR.Other)}>
                    {t(`categories.${expense.category}`, { defaultValue: expense.category })}
                  </Badge>
                  {expense.isRecurring && (
                    <span className="text-xs text-muted-foreground">{t(`frequency.${expense.recurringFrequency}`, { defaultValue: expense.recurringFrequency })}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(expense.date)}{expense.notes && ` · ${expense.notes}`}</p>
              </div>
              <div className="shrink-0 text-end me-2">
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(expense.amount)}</p>
                {expense.isPaid && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center justify-end gap-1 mt-0.5">
                    <Check className="h-3 w-3" />{t("expenses.paid")}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!expense.isPaid && (
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" title={t("expenses.markPaid")} onClick={() => handleMarkPaid(expense.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(expense)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(expense.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
