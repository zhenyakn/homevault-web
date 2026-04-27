import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, Trash2, Check, Pencil, Download, Filter } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

const CATEGORIES = ["Mortgage", "Utility", "Insurance", "Tax", "Maintenance", "Other"] as const;
const FREQUENCIES = ["Monthly", "Quarterly", "Annual"] as const;

export default function Expenses() {
  const { data: expenses, isLoading, refetch } = trpc.expenses.list.useQuery();
  const createMutation = trpc.expenses.create.useMutation();
  const updateMutation = trpc.expenses.update.useMutation();
  const deleteMutation = trpc.expenses.delete.useMutation();
  const markPaidMutation = trpc.expenses.markAsPaid.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    label: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Maintenance" as typeof CATEGORIES[number],
    isRecurring: false,
    recurringFrequency: "Monthly" as typeof FREQUENCIES[number],
    notes: "",
  });
  const [attachments, setAttachments] = useState<any[]>([]);

  const resetForm = () => {
    setFormData({
      label: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      category: "Maintenance",
      isRecurring: false,
      recurringFrequency: "Monthly",
      notes: "",
    });
    setAttachments([]);
    setEditingId(null);
  };

  const handleEdit = (expense: any) => {
    setEditingId(expense.id);
    setFormData({
      label: expense.label,
      amount: String(expense.amount / 100),
      date: expense.date,
      category: expense.category,
      isRecurring: expense.isRecurring || false,
      recurringFrequency: expense.recurringFrequency || "Monthly",
      notes: expense.notes || "",
    });
    setAttachments((expense.attachments || []).map((url: string) => ({ url, filename: url.split('/').pop() || 'file', mimeType: 'application/octet-stream', size: 0 })));
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.label || !formData.amount) {
      toast.error("Please fill in all required fields");
      return;
    }

    const attachmentUrls = attachments.map(a => a.url);

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            ...formData,
            amount: Math.round(parseFloat(formData.amount) * 100),
            attachments: attachmentUrls,
          },
        });
        toast.success("Expense updated");
      } else {
        await createMutation.mutateAsync({
          ...formData,
          amount: Math.round(parseFloat(formData.amount) * 100),
          attachments: attachmentUrls,
        });
        toast.success("Expense created");
      }
      setOpen(false);
      resetForm();
      refetch();
    } catch (error) {
      toast.error("Failed to save expense");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Expense deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete expense");
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await markPaidMutation.mutateAsync({
        id,
        paidDate: new Date().toISOString().split("T")[0],
      });
      toast.success("Marked as paid");
      refetch();
    } catch (error) {
      toast.error("Failed to mark as paid");
    }
  };

  const handleExportCSV = () => {
    if (!filteredExpenses || filteredExpenses.length === 0) {
      toast.error("No expenses to export");
      return;
    }
    const headers = ["Description", "Amount", "Date", "Category", "Recurring", "Frequency", "Paid", "Notes"];
    const rows = filteredExpenses.map((e: any) => [
      e.label,
      (e.amount / 100).toFixed(2),
      e.date,
      e.category,
      e.isRecurring ? "Yes" : "No",
      e.recurringFrequency || "",
      e.isPaid ? "Yes" : "No",
      e.notes || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r: string[]) => r.map((c: string) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Expenses exported to CSV");
  };

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    if (categoryFilter === "all") return expenses;
    return expenses.filter((e: any) => e.category === categoryFilter);
  }, [expenses, categoryFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  const totalExpenses = filteredExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const recurringExpenses = filteredExpenses.filter((e: any) => e.isRecurring);
  const monthlyRecurring = recurringExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const paidCount = filteredExpenses.filter((e: any) => e.isPaid).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground mt-2">Track and manage all property expenses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Expense" : "Add New Expense"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="label">Description</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g., Monthly mortgage payment"
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={(value: any) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="recurring"
                    checked={formData.isRecurring}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isRecurring: checked as boolean })
                    }
                  />
                  <Label htmlFor="recurring">Recurring Expense</Label>
                </div>
                {formData.isRecurring && (
                  <div>
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select value={formData.recurringFrequency} onValueChange={(value: any) => setFormData({ ...formData, recurringFrequency: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((freq) => (
                          <SelectItem key={freq} value={freq}>
                            {freq}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
                <div>
                  <Label>Attachments</Label>
                  <FileUpload
                    onUpload={(file) => setAttachments([...attachments, file])}
                    existingFiles={attachments}
                    onRemove={(i) => setAttachments(attachments.filter((_, idx) => idx !== i))}
                    accept="image/*,.pdf,.doc,.docx"
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  {editingId ? "Update" : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Recurring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyRecurring)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredExpenses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{paidCount} / {filteredExpenses.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoryFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setCategoryFilter("all")}>
            Clear filter
          </Button>
        )}
      </div>

      {/* Expenses List */}
      <Card>
        <CardHeader>
          <CardTitle>Expense History</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {categoryFilter !== "all"
                ? `No ${categoryFilter} expenses found.`
                : "No expenses yet. Add your first expense to get started."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredExpenses.map((expense: any) => (
                <div
                  key={expense.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{expense.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {expense.category} &middot; {formatDate(expense.date)}
                      {expense.isRecurring && ` · Recurring (${expense.recurringFrequency})`}
                    </div>
                    {expense.notes && (
                      <div className="text-xs text-muted-foreground mt-1">{expense.notes}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(expense.amount)}</div>
                      {expense.isPaid && (
                        <div className="text-xs text-green-600 flex items-center justify-end gap-1">
                          <Check className="w-3 h-3" /> Paid
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!expense.isPaid && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkPaid(expense.id)}
                          title="Mark as paid"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(expense)}
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(expense.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
