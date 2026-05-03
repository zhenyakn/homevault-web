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
import { Loader2, Plus, Pencil, Trash2, Download, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Category = "Appliance" | "Furniture" | "Electronics" | "Consumable" | "Tool" | "Valuable" | "Other";
type Condition = "New" | "Good" | "Fair" | "Poor";

interface InventoryItem {
  id: string;
  name: string;
  sku?: string | null;
  category?: Category | null;
  room?: string | null;
  quantity: number;
  minQuantity?: number | null;
  unit?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  brand?: string | null;
  store?: string | null;
  warrantyExpiry?: string | null;
  condition?: Condition | null;
  notes?: string | null;
  serialNumber?: string | null;
}

const CATEGORIES: Category[] = ["Appliance", "Furniture", "Electronics", "Consumable", "Tool", "Valuable", "Other"];
const CONDITIONS: Condition[] = ["New", "Good", "Fair", "Poor"];

const CONDITION_COLORS: Record<Condition, string> = {
  New: "bg-emerald-500 text-white",
  Good: "bg-blue-500 text-white",
  Fair: "bg-yellow-500 text-white",
  Poor: "bg-red-500 text-white",
};

const defaultForm = {
  name: "",
  sku: "",
  category: "Other" as Category,
  room: "",
  quantity: "1",
  minQuantity: "0",
  unit: "",
  purchasePrice: "",
  purchaseDate: "",
  brand: "",
  store: "",
  warrantyExpiry: "",
  condition: "Good" as Condition,
  notes: "",
  serialNumber: "",
};

export default function Inventory() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterRoom, setFilterRoom] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState(defaultForm);

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.inventory.list.useQuery();

  const createMutation = trpc.inventory.create.useMutation({
    onSuccess: () => {
      toast.success("Item added to inventory");
      utils.inventory.list.invalidate();
      closeDialog();
    },
    onError: (error) => toast.error(`Failed to add item: ${error.message}`),
  });

  const updateMutation = trpc.inventory.update.useMutation({
    onSuccess: () => {
      toast.success("Item updated");
      utils.inventory.list.invalidate();
      closeDialog();
    },
    onError: (error) => toast.error(`Failed to update item: ${error.message}`),
  });

  const deleteMutation = trpc.inventory.delete.useMutation({
    onSuccess: () => {
      toast.success("Item deleted");
      utils.inventory.list.invalidate();
    },
    onError: (error) => toast.error(`Failed to delete item: ${error.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error("Name is required"); return; }

    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty < 0) { toast.error("Quantity must be a non-negative number"); return; }

    const data: any = {
      name: formData.name.trim(),
      category: formData.category,
      condition: formData.condition,
      quantity: qty,
      minQuantity: parseInt(formData.minQuantity) || 0,
    };
    if (formData.sku) data.sku = formData.sku;
    if (formData.room) data.room = formData.room;
    if (formData.unit) data.unit = formData.unit;
    if (formData.brand) data.brand = formData.brand;
    if (formData.store) data.store = formData.store;
    if (formData.serialNumber) data.serialNumber = formData.serialNumber;
    if (formData.notes) data.notes = formData.notes;
    if (formData.purchaseDate) data.purchaseDate = formData.purchaseDate;
    if (formData.warrantyExpiry) data.warrantyExpiry = formData.warrantyExpiry;
    if (formData.purchasePrice) {
      const price = Math.round(parseFloat(formData.purchasePrice) * 100);
      if (!isNaN(price)) data.purchasePrice = price;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setFormData({
      name: item.name,
      sku: item.sku || "",
      category: item.category || "Other",
      room: item.room || "",
      quantity: String(item.quantity),
      minQuantity: String(item.minQuantity ?? 0),
      unit: item.unit || "",
      purchasePrice: item.purchasePrice ? (item.purchasePrice / 100).toString() : "",
      purchaseDate: item.purchaseDate || "",
      brand: item.brand || "",
      store: item.store || "",
      warrantyExpiry: item.warrantyExpiry || "",
      condition: item.condition || "Good",
      notes: item.notes || "",
      serialNumber: item.serialNumber || "",
    });
    setEditingId(item.id);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this inventory item?")) deleteMutation.mutate({ id });
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData(defaultForm);
  };

  // Derived data
  const rooms = Array.from(new Set(items.map((i) => i.room).filter(Boolean))) as string[];

  const filteredItems = items.filter((item) => {
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (filterRoom !== "all" && item.room !== filterRoom) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.brand || "").toLowerCase().includes(q) ||
        (item.sku || "").toLowerCase().includes(q) ||
        (item.room || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalItems = items.length;
  const totalValue = items.reduce((sum, i) => sum + (i.purchasePrice ?? 0) * i.quantity, 0);
  const lowStockCount = items.filter((i) => i.minQuantity != null && i.minQuantity > 0 && i.quantity <= i.minQuantity).length;

  const handleExportCSV = () => {
    if (!items.length) { toast.error("Nothing to export"); return; }
    const headers = ["Name", "Category", "Room", "Quantity", "Unit", "Condition", "Brand", "SKU", "Purchase Price", "Purchase Date", "Warranty Expiry", "Serial Number", "Notes"];
    const rows = filteredItems.map((i) => [
      i.name, i.category || "", i.room || "", i.quantity, i.unit || "", i.condition || "",
      i.brand || "", i.sku || "",
      i.purchasePrice ? (i.purchasePrice / 100).toFixed(2) : "",
      i.purchaseDate || "", i.warrantyExpiry || "", i.serialNumber || "", i.notes || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventory_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 me-1.5" />Export CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setIsDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 me-1.5" />Add Item</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Bosch Washing Machine" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={formData.category} onValueChange={(v: Category) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="condition">Condition</Label>
                    <Select value={formData.condition} onValueChange={(v: Condition) => setFormData({ ...formData, condition: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="room">Room</Label>
                    <Input id="room" value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })} placeholder="e.g. Kitchen" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Input id="brand" value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} placeholder="e.g. Samsung" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" type="number" min="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minQuantity">Min Quantity (alert threshold)</Label>
                    <Input id="minQuantity" type="number" min="0" value={formData.minQuantity} onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input id="unit" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} placeholder="e.g. pcs, liters" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchasePrice">Purchase Price</Label>
                    <Input id="purchasePrice" type="number" step="0.01" min="0" value={formData.purchasePrice} onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchaseDate">Purchase Date</Label>
                    <Input id="purchaseDate" type="date" value={formData.purchaseDate} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
                    <Input id="warrantyExpiry" type="date" value={formData.warrantyExpiry} onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU / Model #</Label>
                    <Input id="sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="WF45R6100AW" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serialNumber">Serial Number</Label>
                    <Input id="serialNumber" value={formData.serialNumber} onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} placeholder="SN-XXXXXXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store">Store / Supplier</Label>
                    <Input id="store" value={formData.store} onChange={(e) => setFormData({ ...formData, store: e.target.value })} placeholder="e.g. Home Depot" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Any additional notes..." />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {editingId ? "Update" : "Add Item"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Total Items</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{totalItems}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalValue)}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
          <p className={`text-xl font-semibold tabular-nums mt-1 ${lowStockCount > 0 ? "text-orange-500" : ""}`}>{lowStockCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search items..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {rooms.length > 0 && (
          <Select value={filterRoom} onValueChange={setFilterRoom}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All rooms" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Empty state */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg">
          <Package className="h-10 w-10 mb-3 text-muted-foreground/50" />
          <p className="font-medium text-foreground">No inventory items</p>
          <p className="text-sm mt-1 max-w-xs">Track appliances, furniture, tools, and consumables. Add your first item to get started.</p>
          <Button size="sm" className="mt-4" onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 me-1.5" />Add first item
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Room</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Condition</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Value</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item) => {
                const isLowStock = item.minQuantity != null && item.minQuantity > 0 && item.quantity <= item.minQuantity;
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                        </div>
                        {isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" title="Low stock" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.room || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={isLowStock ? "text-orange-500 font-medium" : ""}>{item.quantity}</span>
                      {item.unit && <span className="text-muted-foreground ml-1">{item.unit}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {item.condition ? (
                        <Badge className={`text-xs ${CONDITION_COLORS[item.condition as Condition] || ""}`}>{item.condition}</Badge>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {item.purchasePrice ? formatCurrency(item.purchasePrice * item.quantity) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item as InventoryItem)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
