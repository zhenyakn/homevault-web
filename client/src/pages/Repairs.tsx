import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";
import { cn } from "@/lib/utils";

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const STATUSES = ["Pending", "In Progress", "Resolved"] as const;

const PRIORITY_COLOR: Record<string, string> = {
  Low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Medium: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  High: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  Critical: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};
const STATUS_COLOR: Record<string, string> = {
  Pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  Resolved: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

const emptyForm = () => ({
  label: "", description: "",
  priority: "Medium" as typeof PRIORITIES[number],
  status: "Pending" as typeof STATUSES[number],
  dateLogged: new Date().toISOString().split("T")[0],
  contractor: "", contractorPhone: "", estimatedCost: "", actualCost: "", notes: "",
});

export default function Repairs() {
  const { data: repairs, isLoading, refetch } = trpc.repairs.list.useQuery();
  const createMutation = trpc.repairs.create.useMutation();
  const updateMutation = trpc.repairs.update.useMutation();
  const deleteMutation = trpc.repairs.delete.useMutation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [attachments, setAttachments] = useState<any[]>([]);

  const reset = () => { setForm(emptyForm()); setAttachments([]); setEditingId(null); };

  const handleEdit = (r: any) => {
    setEditingId(r.id);
    setForm({ label: r.label, description: r.description || "", priority: r.priority, status: r.status, dateLogged: r.dateLogged, contractor: r.contractor || "", contractorPhone: r.contractorPhone || "", estimatedCost: r.estimatedCost ? String(r.estimatedCost / 100) : "", actualCost: r.actualCost ? String(r.actualCost / 100) : "", notes: r.notes || "" });
    setAttachments((r.attachments || []).map((url: string) => ({ url, filename: url.split("/").pop() || "file", mimeType: "application/octet-stream", size: 0 })));
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.label) { toast.error("Description is required"); return; }
    try {
      const payload = { label: form.label, description: form.description || undefined, priority: form.priority, status: form.status, dateLogged: form.dateLogged, contractor: form.contractor || undefined, contractorPhone: form.contractorPhone || undefined, estimatedCost: form.estimatedCost ? parseInt(form.estimatedCost) * 100 : undefined, actualCost: form.actualCost ? parseInt(form.actualCost) * 100 : undefined, notes: form.notes || undefined, attachments: attachments.map(a => a.url) };
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, data: payload }); toast.success("Updated"); }
      else { await createMutation.mutateAsync(payload); toast.success("Repair logged"); }
      setOpen(false); reset(); refetch();
    } catch { toast.error("Failed to save"); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMutation.mutateAsync({ id }); toast.success("Deleted"); refetch(); }
    catch { toast.error("Failed to delete"); }
  };

  const handleExportCSV = () => {
    if (!repairs?.length) { toast.error("Nothing to export"); return; }
    const rows = repairs.map((r: any) => [r.label, r.priority, r.status, r.dateLogged, r.contractor||"", r.contractorPhone||"", r.estimatedCost?(r.estimatedCost/100).toFixed(2):"", r.actualCost?(r.actualCost/100).toFixed(2):"", r.notes||""]);
    const csv = [["Description","Priority","Status","Date","Contractor","Phone","Est Cost","Actual Cost","Notes"], ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    a.download = `repairs_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    toast.success("Exported");
  };

  if (isLoading) return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  const pending = repairs?.filter((r: any) => r.status === "Pending").length || 0;
  const inProgress = repairs?.filter((r: any) => r.status === "In Progress").length || 0;
  const resolved = repairs?.filter((r: any) => r.status === "Resolved").length || 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Repairs</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
          </Button>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Log repair</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit repair" : "Log repair"}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder="e.g. Leaking kitchen faucet" />
                </div>
                <div className="space-y-1.5">
                  <Label>Details</Label>
                  <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Additional details" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v: any) => setForm({...form, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v: any) => setForm({...form, status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Date logged</Label>
                  <Input type="date" value={form.dateLogged} onChange={e => setForm({...form, dateLogged: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Contractor</Label>
                    <Input value={form.contractor} onChange={e => setForm({...form, contractor: e.target.value})} placeholder="Name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={form.contractorPhone} onChange={e => setForm({...form, contractorPhone: e.target.value})} placeholder="+1 555 …" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Estimated cost</Label>
                    <Input type="number" value={form.estimatedCost} onChange={e => setForm({...form, estimatedCost: e.target.value})} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Actual cost</Label>
                    <Input type="number" value={form.actualCost} onChange={e => setForm({...form, actualCost: e.target.value})} placeholder="0" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Attachments</Label>
                  <FileUpload onUpload={f => setAttachments([...attachments, f])} existingFiles={attachments} onRemove={i => setAttachments(attachments.filter((_, idx) => idx !== i))} accept="image/*,.pdf" />
                </div>
                <Button onClick={handleSubmit} className="w-full">{editingId ? "Update" : "Log repair"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        {[
          { label: "Pending",     value: String(pending)    },
          { label: "In progress", value: String(inProgress) },
          { label: "Resolved",    value: String(resolved)   },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {!repairs || repairs.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No repairs logged yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {repairs.map((repair: any) => (
            <div key={repair.id} className="flex items-start gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{repair.label}</p>
                  <Badge className={cn("text-xs h-5 border-0", PRIORITY_COLOR[repair.priority])}>{repair.priority}</Badge>
                  <Badge className={cn("text-xs h-5 border-0", STATUS_COLOR[repair.status])}>{repair.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(repair.dateLogged)}
                  {repair.contractor && ` · ${repair.contractor}`}
                  {repair.contractorPhone && ` (${repair.contractorPhone})`}
                </p>
                {repair.description && <p className="text-xs text-muted-foreground mt-1">{repair.description}</p>}
              </div>
              <div className="shrink-0 text-right text-sm mr-2">
                {repair.estimatedCost != null && <p className="text-xs text-muted-foreground">Est: {formatCurrency(repair.estimatedCost)}</p>}
                {repair.actualCost != null && <p className="font-medium">{formatCurrency(repair.actualCost)}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(repair)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(repair.id)}>
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
