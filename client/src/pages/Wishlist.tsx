import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

type Priority = "Low" | "Medium" | "High";

interface WishlistItem {
  id: string;
  label: string;
  description?: string | null;
  estimatedCost: number;
  priority: Priority;
  [key: string]: any;
}

export default function Wishlist() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    label: "",
    description: "",
    estimatedCost: "",
    priority: "Medium" as Priority,
  });

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.wishlist.list.useQuery();

  const createMutation = trpc.wishlist.create.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.addItem"));
      utils.wishlist.list.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(`${t("wishlist.failedCreate")}: ${error.message}`);
    },
  });

  const updateMutation = trpc.wishlist.update.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.editItem"));
      utils.wishlist.list.invalidate();
      closeDialog();
    },
    onError: (error) => {
      toast.error(`${t("wishlist.failedUpdate")}: ${error.message}`);
    },
  });

  const deleteMutation = trpc.wishlist.delete.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.deleted"));
      utils.wishlist.list.invalidate();
    },
    onError: (error) => {
      toast.error(`${t("wishlist.failedDeleteMsg")}: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.label) {
      toast.error(t("wishlist.labelRequired"));
      return;
    }

    const estimatedCostCents = Math.round(parseFloat(formData.estimatedCost) * 100);
    if (isNaN(estimatedCostCents)) {
      toast.error(t("wishlist.validCostRequired"));
      return;
    }

    const data = {
      label: formData.label,
      description: formData.description || undefined,
      estimatedCost: estimatedCostCents,
      priority: formData.priority,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: WishlistItem) => {
    setFormData({
      label: item.label,
      description: item.description || "",
      estimatedCost: (item.estimatedCost / 100).toString(),
      priority: item.priority,
    });
    setEditingId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t("wishlist.deleteConfirm"))) {
      deleteMutation.mutate({ id });
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData({
      label: "",
      description: "",
      estimatedCost: "",
      priority: "Medium",
    });
  };

  const priorityWeight = { High: 3, Medium: 2, Low: 1 };
  const sortedItems = [...items].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  const totalItems = items.length;
  const totalEstimatedCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  const highPriorityCount = items.filter(item => item.priority === "High").length;

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "High": return "bg-orange-500 hover:bg-orange-600 text-white";
      case "Medium": return "bg-yellow-500 hover:bg-yellow-600 text-white";
      case "Low": return "bg-slate-500 hover:bg-slate-600 text-white";
      default: return "bg-slate-500 hover:bg-slate-600 text-white";
    }
  };

  const handleExportCSV = () => {
    if (!items || items.length === 0) { toast.error(t("wishlist.nothingToExport")); return; }
    const headers = ["Label", "Priority", "Estimated Cost", "Description"];
    const rows = sortedItems.map((i: any) => [
      i.label, i.priority, (i.estimatedCost / 100).toFixed(2), i.description || "",
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `wishlist_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("wishlist.exported"));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("wishlist.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 me-1.5" />{t("common.exportCsv")}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (!open) closeDialog();
            else setIsDialogOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 me-1.5" />{t("wishlist.addItem")}</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("wishlist.editItem") : t("wishlist.addItem")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="label">{t("common.label")}</Label>
                <Input
                  id="label"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder={t("wishlist.placeholderLabel")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("common.description")} ({t("common.optional")})</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("wishlist.placeholderDesc")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedCost">{t("wishlist.estimatedCost")}</Label>
                <Input
                  id="estimatedCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimatedCost}
                  onChange={(e) => setFormData({ ...formData, estimatedCost: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">{t("common.priority")}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: Priority) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("common.select") + " " + t("common.priority")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">{t("priority.Low")}</SelectItem>
                    <SelectItem value="Medium">{t("priority.Medium")}</SelectItem>
                    <SelectItem value="High">{t("priority.High")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  )}
                  {editingId ? t("common.update") : t("common.create")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("wishlist.totalItems")}</p><p className="text-xl font-semibold tabular-nums mt-1">{totalItems}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("wishlist.estimatedTotal")}</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalEstimatedCost)}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("wishlist.highPriority")}</p><p className="text-xl font-semibold tabular-nums mt-1">{highPriorityCount}</p></div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("wishlist.noItems")}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {sortedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{item.label}</p>
                  <Badge className={`text-xs h-5 border-0 ${getPriorityColor(item.priority)}`}>{t(`priority.${item.priority}`)}</Badge>
                </div>
                {item.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>}
              </div>
              <p className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(item.estimatedCost)}</p>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
