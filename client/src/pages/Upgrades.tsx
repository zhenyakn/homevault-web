import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, Wallet, TrendingUp, Activity, Download } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

type UpgradeStatus = "Planned" | "In Progress" | "Done";

export default function Upgrades() {
  const utils = trpc.useUtils();
  const { data: upgrades, isLoading } = trpc.upgrades.list.useQuery();
  const createMutation = trpc.upgrades.create.useMutation({
    onSuccess: () => { toast.success("Upgrade created successfully"); utils.upgrades.list.invalidate(); setIsDialogOpen(false); resetForm(); },
    onError: (error) => toast.error(`Failed to create upgrade: ${error.message}`),
  });
  const updateMutation = trpc.upgrades.update.useMutation({
    onSuccess: () => { toast.success("Upgrade updated successfully"); utils.upgrades.list.invalidate(); setIsDialogOpen(false); resetForm(); },
    onError: (error) => toast.error(`Failed to update upgrade: ${error.message}`),
  });
  const deleteMutation = trpc.upgrades.delete.useMutation({
    onSuccess: () => { toast.success("Upgrade deleted successfully"); utils.upgrades.list.invalidate(); },
    onError: (error) => toast.error(`Failed to delete upgrade: ${error.message}`),
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ label: "", description: "", status: "Planned" as UpgradeStatus, budget: "", spent: "", notes: "" });
  const [attachments, setAttachments] = useState<any[]>([]);

  const resetForm = () => { setEditingId(null); setFormData({ label: "", description: "", status: "Planned", budget: "", spent: "", notes: "" }); setAttachments([]); };

  const handleEdit = (upgrade: any) => {
    setEditingId(upgrade.id);
    setFormData({ label: upgrade.label, description: upgrade.description || "", status: upgrade.status, budget: (upgrade.budget / 100).toString(), spent: (upgrade.spent / 100).toString(), notes: upgrade.notes || "" });
    setAttachments((upgrade.attachments || []).map((url: string) => ({ url, filename: url.split('/').pop() || 'file', mimeType: 'application/octet-stream', size: 0 })));
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => { if (confirm("Are you sure you want to delete this upgrade?")) deleteMutation.mutate({ id }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budgetCents = Math.round(parseFloat(formData.budget) * 100);
    const spentCents = formData.spent ? Math.round(parseFloat(formData.spent) * 100) : 0;
    const attachmentUrls = attachments.map((a: any) => a.url);
    const payload = { label: formData.label, description: formData.description, status: formData.status, budget: budgetCents, spent: spentCents, notes: formData.notes, attachments: attachmentUrls };
    if (editingId) updateMutation.mutate({ id: editingId, data: payload });
    else createMutation.mutate(payload);
  };

  const handleExportCSV = () => {
    if (!upgrades || upgrades.length === 0) { toast.error("No upgrades to export"); return; }
    const headers = ["Label", "Status", "Budget", "Spent", "Remaining", "Notes"];
    const rows = upgrades.map((u: any) => [
      u.label, u.status,
      (u.budget / 100).toFixed(2),
      ((u.spent || 0) / 100).toFixed(2),
      ((u.budget - (u.spent || 0)) / 100).toFixed(2),
      u.notes || "",
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `upgrades_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Upgrades exported to CSV");
  };

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const totalBudget = upgrades?.reduce((sum, u) => sum + u.budget, 0) || 0;
  const totalSpent = upgrades?.reduce((sum, u) => sum + (u.spent || 0), 0) || 0;
  const activeProjects = upgrades?.filter((u) => u.status === "In Progress").length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Planned": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      case "In Progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "Done": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Upgrades</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Add upgrade</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Upgrade" : "Add Upgrade"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: UpgradeStatus) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input
                    id="budget"
                    type="number"
                    step="0.01"
                    required
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spent">Spent</Label>
                  <Input
                    id="spent"
                    type="number"
                    step="0.01"
                    value={formData.spent}
                    onChange={(e) => setFormData({ ...formData, spent: e.target.value })}
                  />
                </div>
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
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingId ? "Update" : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Total budget</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Total spent</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Active projects</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{activeProjects}</p>
        </div>
      </div>

      {!upgrades?.length ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No upgrades yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {upgrades.map((upgrade) => {
            const progress = upgrade.budget > 0 ? Math.min(100, ((upgrade.spent || 0) / upgrade.budget) * 100) : 0;
            return (
              <div key={upgrade.id} className="flex items-start gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{upgrade.label}</p>
                    <Badge className={`text-xs h-5 border-0 ${getStatusColor(upgrade.status)}`}>{upgrade.status}</Badge>
                  </div>
                  {upgrade.description && <p className="text-xs text-muted-foreground mt-0.5">{upgrade.description}</p>}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Budget vs spent</span>
                      <span className="tabular-nums">{formatCurrency(upgrade.spent || 0)} / {formatCurrency(upgrade.budget)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                      <div className="h-full bg-foreground/70 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(upgrade)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(upgrade.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
