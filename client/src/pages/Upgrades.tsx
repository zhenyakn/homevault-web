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
import { Loader2, Plus, Pencil, Trash2, Wallet, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";

type UpgradeStatus = "Planned" | "In Progress" | "Done";

export default function Upgrades() {
  const utils = trpc.useUtils();
  const { data: upgrades, isLoading } = trpc.upgrades.list.useQuery();
  const createMutation = trpc.upgrades.create.useMutation({
    onSuccess: () => {
      toast.success("Upgrade created successfully");
      utils.upgrades.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(`Failed to create upgrade: ${error.message}`),
  });
  const updateMutation = trpc.upgrades.update.useMutation({
    onSuccess: () => {
      toast.success("Upgrade updated successfully");
      utils.upgrades.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(`Failed to update upgrade: ${error.message}`),
  });
  const deleteMutation = trpc.upgrades.delete.useMutation({
    onSuccess: () => {
      toast.success("Upgrade deleted successfully");
      utils.upgrades.list.invalidate();
    },
    onError: (error) => toast.error(`Failed to delete upgrade: ${error.message}`),
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    label: "",
    description: "",
    status: "Planned" as UpgradeStatus,
    budget: "",
    spent: "",
    notes: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      label: "",
      description: "",
      status: "Planned",
      budget: "",
      spent: "",
      notes: "",
    });
  };

  const handleEdit = (upgrade: any) => {
    setEditingId(upgrade.id);
    setFormData({
      label: upgrade.label,
      description: upgrade.description || "",
      status: upgrade.status,
      budget: (upgrade.budget / 100).toString(),
      spent: (upgrade.spent / 100).toString(),
      notes: upgrade.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this upgrade?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budgetCents = Math.round(parseFloat(formData.budget) * 100);
    const spentCents = formData.spent ? Math.round(parseFloat(formData.spent) * 100) : 0;

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          label: formData.label,
          description: formData.description,
          status: formData.status,
          budget: budgetCents,
          spent: spentCents,
          notes: formData.notes,
        },
      });
    } else {
      createMutation.mutate({
        label: formData.label,
        description: formData.description,
        status: formData.status,
        budget: budgetCents,
        spent: spentCents,
        notes: formData.notes,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalBudget = upgrades?.reduce((sum, u) => sum + u.budget, 0) || 0;
  const totalSpent = upgrades?.reduce((sum, u) => sum + (u.spent || 0), 0) || 0;
  const activeProjects = upgrades?.filter((u) => u.status === "In Progress").length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Planned":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      case "In Progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "Done":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Upgrades</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Upgrade
            </Button>
          </DialogTrigger>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
          </CardContent>
        </Card>
      </div>

      {!upgrades?.length ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-semibold">No upgrades found</h3>
            <p className="text-sm text-muted-foreground">Add your first upgrade to get started.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {upgrades.map((upgrade) => {
            const progress = upgrade.budget > 0 ? Math.min(100, ((upgrade.spent || 0) / upgrade.budget) * 100) : 0;
            
            return (
              <Card key={upgrade.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{upgrade.label}</CardTitle>
                      {upgrade.description && (
                        <p className="text-sm text-muted-foreground mt-1">{upgrade.description}</p>
                      )}
                    </div>
                    <Badge className={getStatusColor(upgrade.status)} variant="secondary">
                      {upgrade.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Budget vs Spent</span>
                      <span className="font-medium">
                        {formatCurrency(upgrade.spent || 0)} / {formatCurrency(upgrade.budget)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  
                  {upgrade.notes && (
                    <div className="text-sm bg-muted p-2 rounded-md">
                      {upgrade.notes}
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-2 pt-4 mt-auto">
                    <Button variant="outline" size="icon" onClick={() => handleEdit(upgrade)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(upgrade.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
