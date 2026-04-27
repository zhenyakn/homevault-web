import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, Wrench } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { FileUpload } from "@/components/FileUpload";

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const STATUSES = ["Pending", "In Progress", "Resolved"] as const;
const priorityColor: Record<string, string> = { Low: "bg-slate-100 text-slate-700", Medium: "bg-yellow-100 text-yellow-700", High: "bg-orange-100 text-orange-700", Critical: "bg-red-100 text-red-700" };
const statusColor: Record<string, string> = { Pending: "bg-gray-100 text-gray-700", "In Progress": "bg-blue-100 text-blue-700", Resolved: "bg-green-100 text-green-700" };

export default function Repairs() {
  const { data: repairs, isLoading, refetch } = trpc.repairs.list.useQuery();
  const createMutation = trpc.repairs.create.useMutation();
  const updateMutation = trpc.repairs.update.useMutation();
  const deleteMutation = trpc.repairs.delete.useMutation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ label: "", description: "", priority: "Medium" as typeof PRIORITIES[number], status: "Pending" as typeof STATUSES[number], dateLogged: new Date().toISOString().split("T")[0], contractor: "", contractorPhone: "", estimatedCost: "", actualCost: "", notes: "" });
  const [attachments, setAttachments] = useState<any[]>([]);
  const resetForm = () => { setFormData({ label: "", description: "", priority: "Medium", status: "Pending", dateLogged: new Date().toISOString().split("T")[0], contractor: "", contractorPhone: "", estimatedCost: "", actualCost: "", notes: "" }); setAttachments([]); setEditingId(null); };
  const handleSubmit = async () => {
    if (!formData.label) { toast.error("Please enter a description"); return; }
    try {
      const attachmentUrls = attachments.map((a: any) => a.url);
      const payload = { label: formData.label, description: formData.description || undefined, priority: formData.priority, status: formData.status, dateLogged: formData.dateLogged, contractor: formData.contractor || undefined, contractorPhone: formData.contractorPhone || undefined, estimatedCost: formData.estimatedCost ? parseInt(formData.estimatedCost) * 100 : undefined, actualCost: formData.actualCost ? parseInt(formData.actualCost) * 100 : undefined, notes: formData.notes || undefined, attachments: attachmentUrls };
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, data: payload }); toast.success("Repair updated"); }
      else { await createMutation.mutateAsync(payload); toast.success("Repair logged"); }
      setOpen(false); resetForm(); refetch();
    } catch { toast.error("Failed to save repair"); }
  };
  const handleEdit = (repair: any) => { setEditingId(repair.id); setFormData({ label: repair.label, description: repair.description || "", priority: repair.priority, status: repair.status, dateLogged: repair.dateLogged, contractor: repair.contractor || "", contractorPhone: repair.contractorPhone || "", estimatedCost: repair.estimatedCost ? String(repair.estimatedCost / 100) : "", actualCost: repair.actualCost ? String(repair.actualCost / 100) : "", notes: repair.notes || "" }); setAttachments((repair.attachments || []).map((url: string) => ({ url, filename: url.split('/').pop() || 'file', mimeType: 'application/octet-stream', size: 0 }))); setOpen(true); };
  const handleDelete = async (id: string) => { try { await deleteMutation.mutateAsync({ id }); toast.success("Repair deleted"); refetch(); } catch { toast.error("Failed to delete"); } };
  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin w-8 h-8" /></div>;
  const pending = repairs?.filter(r => r.status === "Pending").length || 0;
  const inProgress = repairs?.filter(r => r.status === "In Progress").length || 0;
  const resolved = repairs?.filter(r => r.status === "Resolved").length || 0;
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div><h1 className="text-3xl font-bold tracking-tight">Repairs</h1><p className="text-muted-foreground mt-2">Track and manage home repairs and maintenance.</p></div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Log Repair</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Repair" : "Log New Repair"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Description *</Label><Input value={formData.label} onChange={e => setFormData({...formData, label: e.target.value})} placeholder="e.g., Leaking kitchen faucet" /></div>
              <div><Label>Details</Label><Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Detailed description" rows={3} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Priority</Label><Select value={formData.priority} onValueChange={(v: any) => setFormData({...formData, priority: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Status</Label><Select value={formData.status} onValueChange={(v: any) => setFormData({...formData, status: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div><Label>Date Logged</Label><Input type="date" value={formData.dateLogged} onChange={e => setFormData({...formData, dateLogged: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contractor</Label><Input value={formData.contractor} onChange={e => setFormData({...formData, contractor: e.target.value})} placeholder="Name" /></div>
                <div><Label>Phone</Label><Input value={formData.contractorPhone} onChange={e => setFormData({...formData, contractorPhone: e.target.value})} placeholder="Phone" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Estimated Cost</Label><Input type="number" value={formData.estimatedCost} onChange={e => setFormData({...formData, estimatedCost: e.target.value})} placeholder="0" /></div>
                <div><Label>Actual Cost</Label><Input type="number" value={formData.actualCost} onChange={e => setFormData({...formData, actualCost: e.target.value})} placeholder="0" /></div>
              </div>
              <div><Label>Notes</Label><Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Optional notes" /></div>
              <div><Label>Attachments</Label><FileUpload onUpload={(file) => setAttachments([...attachments, file])} existingFiles={attachments} onRemove={(i) => setAttachments(attachments.filter((_, idx) => idx !== i))} accept="image/*,.pdf" /></div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Update" : "Log Repair"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{pending}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{inProgress}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{resolved}</div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Repair Log</CardTitle></CardHeader><CardContent>
        {!repairs || repairs.length === 0 ? (<div className="text-center py-8"><Wrench className="w-12 h-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No repairs logged yet.</p></div>) : (
          <div className="space-y-3">{repairs.map(repair => (
            <div key={repair.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
              <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="font-medium">{repair.label}</span><Badge className={priorityColor[repair.priority]}>{repair.priority}</Badge><Badge className={statusColor[repair.status]}>{repair.status}</Badge></div>
                <div className="text-sm text-muted-foreground">{formatDate(repair.dateLogged)}{repair.contractor && ` • ${repair.contractor}`}{repair.contractorPhone && ` (${repair.contractorPhone})`}</div>
                {repair.description && <p className="text-sm mt-1 text-muted-foreground">{repair.description}</p>}</div>
              <div className="text-right mr-4">{repair.estimatedCost != null && <div className="text-sm text-muted-foreground">Est: {formatCurrency(repair.estimatedCost)}</div>}{repair.actualCost != null && <div className="font-semibold">Actual: {formatCurrency(repair.actualCost)}</div>}</div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => handleEdit(repair)}><Pencil className="w-4 h-4" /></Button><Button size="sm" variant="destructive" onClick={() => handleDelete(repair.id)}><Trash2 className="w-4 h-4" /></Button></div>
            </div>))}</div>)}
      </CardContent></Card>
    </div>
  );
}
