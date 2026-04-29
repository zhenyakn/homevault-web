import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, Receipt, Hash, TrendingUp, Download } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

const CATEGORIES = ["Lawyer", "Tax", "Moving", "Inspection", "Registration", "Other"];

export default function PurchaseCosts() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    label: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Other",
    notes: "",
  });
  const [attachments, setAttachments] = useState<any[]>([]);

  const utils = trpc.useUtils();
  const { data: costs, isLoading } = trpc.purchaseCosts.list.useQuery();

  const createMutation = trpc.purchaseCosts.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase cost added successfully");
      utils.purchaseCosts.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to add cost: ${error.message}`);
    },
  });

  const updateMutation = trpc.purchaseCosts.update.useMutation({
    onSuccess: () => {
      toast.success("Purchase cost updated successfully");
      utils.purchaseCosts.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to update cost: ${error.message}`);
    },
  });

  const deleteMutation = trpc.purchaseCosts.delete.useMutation({
    onSuccess: () => {
      toast.success("Purchase cost deleted successfully");
      utils.purchaseCosts.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete cost: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      label: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      category: "Other",
      notes: "",
    });
    setEditingId(null);
    setAttachments([]);
  };

  const handleEdit = (cost: any) => {
    setFormData({
      label: cost.label,
      amount: (cost.amount / 100).toString(),
      date: cost.date,
      category: cost.category || "Other",
      notes: cost.notes || "",
    });
    setEditingId(cost.id);
    setAttachments((cost.attachments || []).map((url: string) => ({ url, filename: url.split('/').pop() || 'file', mimeType: 'application/octet-stream', size: 0 })));
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this purchase cost?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = Math.round(parseFloat(formData.amount) * 100);
    
    const attachmentUrls = attachments.map((a: any) => a.url);
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          ...formData,
          amount: amountInCents,
          attachments: attachmentUrls,
        } as any,
      });
    } else {
      createMutation.mutate({
        ...formData,
        amount: amountInCents,
        attachments: attachmentUrls,
      } as any);
    }
  };

  const handleExportCSV = () => {
    if (!costs || costs.length === 0) { toast.error("No purchase costs to export"); return; }
    const headers = ["Label", "Amount", "Date", "Category", "Notes"];
    const rows = costs.map((c: any) => [
      c.label, (c.amount / 100).toFixed(2), c.date, c.category || "", c.notes || "",
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `purchase_costs_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Purchase costs exported to CSV");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalCosts = costs?.reduce((sum, cost) => sum + cost.amount, 0) || 0;
  const numItems = costs?.length || 0;
  const largestCost = costs?.reduce((max, cost) => (cost.amount > max ? cost.amount : max), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchase Costs</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Add cost</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Purchase Cost" : "Add Purchase Cost"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (ILS)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
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
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Attachments</Label>
                <FileUpload onUpload={(file) => setAttachments([...attachments, file])} existingFiles={attachments} onRemove={(i) => setAttachments(attachments.filter((_, idx) => idx !== i))} accept="image/*,.pdf" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingId ? "Update" : "Save"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchase Costs</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(totalCosts)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Number of Items</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">{numItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Largest Single Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tabular-nums">{formatCurrency(largestCost)}</div>
          </CardContent>
        </Card>
      </div>

      {costs?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Receipt className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No purchase costs found</p>
            <p className="text-sm text-muted-foreground">Add your first purchase cost to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {costs?.map((cost) => (
            <div key={cost.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{cost.label}</p>
                  {cost.category && <Badge variant="secondary" className="text-xs h-5">{cost.category}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(cost.date)}{cost.notes && ` · ${cost.notes}`}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums shrink-0 mr-2">{formatCurrency(cost.amount)}</p>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(cost)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(cost.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
