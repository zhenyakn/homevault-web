import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { useHomeVaultUI } from "@/contexts/HomeVaultUIContext";
import { MetricCard, HVPageHeader } from "@/components/homevault";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Download,
  Check,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type Priority = "low" | "medium" | "high";

interface WishlistItem {
  id: string;
  name: string;
  notes?: string | null;
  estimatedPrice: number | null;
  priority: string | null;
  [key: string]: any;
}

export default function Wishlist() {
  const { t } = useTranslation();
  const { enabled: hv } = useHomeVaultUI();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    notes: "",
    estimatedPrice: "",
    priority: "medium" as Priority,
    url: "",
  });

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.wishlist.list.useQuery();

  const createMutation = trpc.wishlist.create.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.addItem"));
      utils.wishlist.list.invalidate();
      closeDialog();
    },
    onError: error => {
      toast.error(`${t("wishlist.failedCreate")}: ${error.message}`);
    },
  });

  const updateMutation = trpc.wishlist.update.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.editItem"));
      utils.wishlist.list.invalidate();
      closeDialog();
    },
    onError: error => {
      toast.error(`${t("wishlist.failedUpdate")}: ${error.message}`);
    },
  });

  const deleteMutation = trpc.wishlist.delete.useMutation({
    onSuccess: () => {
      toast.success(t("wishlist.deleted"));
      utils.wishlist.list.invalidate();
    },
    onError: error => {
      toast.error(`${t("wishlist.failedDeleteMsg")}: ${error.message}`);
    },
  });

  // Status changes (e.g. mark purchased) — invalidate only; the caller fires a
  // contextual toast so "purchased" and "moved to upgrades" read distinctly.
  const statusMutation = trpc.wishlist.update.useMutation({
    onSuccess: () => utils.wishlist.list.invalidate(),
    onError: error =>
      toast.error(`${t("wishlist.failedUpdate")}: ${error.message}`),
  });

  const moveToUpgradeMutation = trpc.upgrades.create.useMutation({
    onError: error => toast.error(error.message),
  });

  const handleMarkPurchased = (item: WishlistItem) => {
    statusMutation.mutate({ id: item.id, data: { status: "purchased" } });
    toast.success(t("wishlist.markedPurchased"));
  };

  const handleMoveToUpgrades = async (item: WishlistItem) => {
    try {
      await moveToUpgradeMutation.mutateAsync({
        title: item.name,
        estimatedCost: item.estimatedPrice ?? undefined,
        notes: item.notes ?? undefined,
      });
      statusMutation.mutate({ id: item.id, data: { status: "purchased" } });
      toast.success(t("wishlist.movedToUpgrades"));
    } catch {
      // error toast handled by the mutation
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error(t("wishlist.labelRequired"));
      return;
    }

    const estimatedPriceCents = Math.round(
      parseFloat(formData.estimatedPrice) * 100
    );
    if (isNaN(estimatedPriceCents)) {
      toast.error(t("wishlist.validCostRequired"));
      return;
    }

    const data = {
      name: formData.name,
      notes: formData.notes || undefined,
      estimatedPrice: estimatedPriceCents,
      priority: formData.priority,
      url: formData.url.trim() || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: WishlistItem) => {
    setFormData({
      name: item.name,
      notes: item.notes || "",
      estimatedPrice: ((item.estimatedPrice ?? 0) / 100).toString(),
      priority: (item.priority as Priority) || "medium",
      url: item.url || "",
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
      name: "",
      notes: "",
      estimatedPrice: "",
      priority: "medium",
      url: "",
    });
  };

  const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedItems = [...items].sort(
    (a, b) =>
      (priorityWeight[b.priority ?? "low"] ?? 0) -
      (priorityWeight[a.priority ?? "low"] ?? 0)
  );

  const totalItems = items.length;
  const totalEstimatedCost = items.reduce(
    (sum, item) => sum + (item.estimatedPrice ?? 0),
    0
  );
  const highPriorityCount = items.filter(
    item => item.priority === "high"
  ).length;

  // Soft-tinted pills with dark text — AA-contrast compliant (white on mid-tone
  // fills like orange/yellow-500 failed) and consistent with the other badges.
  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300";
      case "low":
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const handleExportCSV = () => {
    if (!items || items.length === 0) {
      toast.error(t("wishlist.nothingToExport"));
      return;
    }
    const headers = ["Label", "Priority", "Estimated Cost", "Description"];
    const rows = sortedItems.map((i: any) => [
      i.name,
      i.priority,
      ((i.estimatedPrice ?? 0) / 100).toFixed(2),
      i.notes || "",
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wishlist_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
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
      {hv ? (
        <HVPageHeader
          title={t("wishlist.title")}
          hideQuickAdd
          actions={
            <>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                className="h-11 rounded-full px-[18px]"
              >
                <Download className="h-3.5 w-3.5 me-1.5" />
                {t("common.exportCsv")}
              </Button>
              <Button
                onClick={() => setIsDialogOpen(true)}
                className="h-11 rounded-full px-[18px]"
              >
                <Plus className="me-1.5 h-4 w-4" />
                {t("wishlist.addItem")}
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("wishlist.title")}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 me-1.5" />
              {t("common.exportCsv")}
            </Button>
            <Button size="sm" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 me-1.5" />
              {t("wishlist.addItem")}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={open => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("wishlist.editItem") : t("wishlist.addItem")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.label")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("wishlist.placeholderLabel")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">
                {t("common.description")} ({t("common.optional")})
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={e =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder={t("wishlist.placeholderDesc")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedPrice">
                {t("wishlist.estimatedCost")}
              </Label>
              <Input
                id="estimatedPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.estimatedPrice}
                onChange={e =>
                  setFormData({
                    ...formData,
                    estimatedPrice: e.target.value,
                  })
                }
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">{t("common.priority")}</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: Priority) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      t("common.select") + " " + t("common.priority")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("priority.low")}</SelectItem>
                  <SelectItem value="medium">{t("priority.medium")}</SelectItem>
                  <SelectItem value="high">{t("priority.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">{t("wishlist.linkLabel")}</Label>
              <Input
                id="url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={formData.url}
                onChange={e =>
                  setFormData({ ...formData, url: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                {editingId ? t("common.update") : t("common.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {hv ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <MetricCard label={t("wishlist.totalItems")} value={totalItems} />
          <MetricCard
            label={t("wishlist.estimatedTotal")}
            value={formatCurrency(totalEstimatedCost)}
            tone="blue"
          />
          <MetricCard
            label={t("wishlist.highPriority")}
            value={highPriorityCount}
            tone={highPriorityCount > 0 ? "orange" : "neutral"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
          <div className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">
              {t("wishlist.totalItems")}
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {totalItems}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">
              {t("wishlist.estimatedTotal")}
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {formatCurrency(totalEstimatedCost)}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">
              {t("wishlist.highPriority")}
            </p>
            <p className="text-xl font-semibold tabular-nums mt-1">
              {highPriorityCount}
            </p>
          </div>
        </div>
      )}

      {sortedItems.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t("wishlist.noItems")}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {sortedItems.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={`text-sm font-medium ${item.status === "purchased" ? "line-through text-muted-foreground" : ""}`}
                  >
                    {item.name}
                  </p>
                  {item.status === "purchased" ? (
                    <Badge className="text-xs h-5 border-0 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      {t("wishlist.purchased")}
                    </Badge>
                  ) : (
                    <Badge
                      className={`text-xs h-5 border-0 ${getPriorityColor(item.priority)}`}
                    >
                      {t(`priority.${item.priority}`)}
                    </Badge>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {item.notes}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold tabular-nums shrink-0">
                {formatCurrency(item.estimatedPrice ?? 0)}
              </p>
              <div className="flex gap-1 shrink-0">
                {item.url && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    title={t("wishlist.openLink")}
                  >
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("wishlist.openLink")}
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                {item.status !== "purchased" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      title={t("wishlist.markPurchased")}
                      aria-label={t("wishlist.markPurchased")}
                      onClick={() => handleMarkPurchased(item)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      title={t("wishlist.moveToUpgrades")}
                      aria-label={t("wishlist.moveToUpgrades")}
                      onClick={() => handleMoveToUpgrades(item)}
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  aria-label={t("common.edit")}
                  onClick={() => handleEdit(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  aria-label={t("common.delete")}
                  onClick={() => handleDelete(item.id)}
                >
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
