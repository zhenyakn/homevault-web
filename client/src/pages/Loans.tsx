import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Loader2, Plus, Trash2, Edit, Landmark, Banknote, Calendar, ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";

export default function Loans() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRepaymentDialogOpen, setIsRepaymentDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);

  const [formData, setFormData] = useState({
    lender: "",
    totalAmount: "",
    loanType: "Bank",
    interestRate: "",
    startDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    notes: "",
  });

  const [repaymentData, setRepaymentData] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
  });

  const utils = trpc.useUtils();
  const { data: loans, isLoading } = trpc.loans.list.useQuery();

  const createMutation = trpc.loans.create.useMutation({
    onSuccess: () => {
      toast.success("Loan added successfully");
      setIsAddDialogOpen(false);
      resetForm();
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to add loan: ${error.message}`);
    },
  });

  const updateMutation = trpc.loans.update.useMutation({
    onSuccess: () => {
      toast.success("Loan updated successfully");
      setIsEditDialogOpen(false);
      resetForm();
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update loan: ${error.message}`);
    },
  });

  const deleteMutation = trpc.loans.delete.useMutation({
    onSuccess: () => {
      toast.success("Loan deleted successfully");
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete loan: ${error.message}`);
    },
  });

  const addRepaymentMutation = trpc.loans.addRepayment.useMutation({
    onSuccess: () => {
      toast.success("Repayment added successfully");
      setIsRepaymentDialogOpen(false);
      setRepaymentData({
        amount: "",
        date: new Date().toISOString().split("T")[0],
      });
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to add repayment: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      lender: "",
      totalAmount: "",
      loanType: "Bank",
      interestRate: "",
      startDate: new Date().toISOString().split("T")[0],
      dueDate: "",
      notes: "",
    });
    setSelectedLoan(null);
  };

  const handleEdit = (loan: any) => {
    setSelectedLoan(loan);
    setFormData({
      lender: loan.lender,
      totalAmount: (loan.totalAmount / 100).toString(),
      loanType: loan.loanType,
      interestRate: loan.interestRate || "",
      startDate: loan.startDate,
      dueDate: loan.dueDate || "",
      notes: loan.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this loan?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = Math.round(parseFloat(formData.totalAmount) * 100);
    
    if (isNaN(amountInCents) || amountInCents <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const payload = {
      ...formData,
      loanType: formData.loanType as "Family" | "Bank" | "Friend" | "Other",
      totalAmount: amountInCents,
    };
    if (selectedLoan) {
      updateMutation.mutate({
        id: selectedLoan.id,
        data: payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleRepaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const amountInCents = Math.round(parseFloat(repaymentData.amount) * 100);
    
    if (isNaN(amountInCents) || amountInCents <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    addRepaymentMutation.mutate({
      loanId: selectedLoan.id,
      amount: amountInCents,
      date: repaymentData.date,
    });
  };

  const handleExportCSV = () => {
    if (!loans || loans.length === 0) { toast.error("No loans to export"); return; }
    const headers = ["Lender", "Type", "Total Amount", "Total Repaid", "Outstanding", "Interest Rate", "Start Date", "Due Date", "Notes"];
    const rows = loans.map((l: any) => {
      const repayments = l.repayments as any[] || [];
      const repaid = repayments.reduce((s: number, r: any) => s + r.amount, 0);
      return [
        l.lender, l.loanType,
        (l.totalAmount / 100).toFixed(2),
        (repaid / 100).toFixed(2),
        ((l.totalAmount - repaid) / 100).toFixed(2),
        l.interestRate || "", l.startDate, l.dueDate || "", l.notes || "",
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `loans_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Loans exported to CSV");
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalBorrowed = loans?.reduce((sum, loan) => sum + loan.totalAmount, 0) || 0;
  const totalRepaid = loans?.reduce((sum, loan) => {
    const repayments = loan.repayments as any[] || [];
    return sum + repayments.reduce((rSum, r) => rSum + r.amount, 0);
  }, 0) || 0;
  const outstandingBalance = totalBorrowed - totalRepaid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Loans</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Loan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lender">Lender</Label>
                <Input
                  id="lender"
                  required
                  value={formData.lender}
                  onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
                  placeholder="e.g. Bank Leumi, John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">Total Amount</Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    step="0.01"
                    required
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loanType">Type</Label>
                  <Select
                    value={formData.loanType}
                    onValueChange={(value) => setFormData({ ...formData, loanType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Family">Family</SelectItem>
                      <SelectItem value="Friend">Friend</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date (Optional)</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (Optional)</Label>
                <Input
                  id="interestRate"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                  placeholder="e.g. 5% APY"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional details..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Loan
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">Total borrowed</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalBorrowed)}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">Total repaid</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalRepaid)}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(outstandingBalance)}</p></div>
      </div>

      {loans?.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No loans yet</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Loan
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {loans?.map((loan) => {
            const repayments = loan.repayments as any[] || [];
            const repaidAmount = repayments.reduce((sum, r) => sum + r.amount, 0);
            const progress = loan.totalAmount > 0 ? Math.min(100, (repaidAmount / loan.totalAmount) * 100) : 0;
            const isFullyPaid = repaidAmount >= loan.totalAmount;

            return (
              <div key={loan.id} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{loan.lender}</p>
                      <Badge variant={isFullyPaid ? "default" : "secondary"} className={isFullyPaid ? "bg-green-600 text-white" : ""}>{isFullyPaid ? "Paid off" : loan.loanType}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(loan.startDate)}{loan.dueDate && ` → ${formatDate(loan.dueDate)}`}
                      {loan.interestRate && ` · ${loan.interestRate}% interest`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setSelectedLoan(loan); setIsRepaymentDialogOpen(true); }} disabled={isFullyPaid}>+ Repay</Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(loan)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(loan.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Repaid: {formatCurrency(repaidAmount)} of {formatCurrency(loan.totalAmount)}</span>
                    <span className="tabular-nums">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden"><div className={`h-full transition-all ${isFullyPaid?"bg-green-500":"bg-foreground/70"}`} style={{width:`${progress}%`}} /></div>
                </div>
                {repayments.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {repayments.slice(0,3).map((rep,idx) => (
                      <span key={idx} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{formatDate(rep.date)} · {formatCurrency(rep.amount)}</span>
                    ))}
                    {repayments.length > 3 && <span className="text-xs text-muted-foreground">+{repayments.length-3} more</span>}
                  </div>
                )}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Amount</div>
                      <div className="text-lg font-semibold">{formatCurrency(loan.totalAmount)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Outstanding</div>
                      <div className="text-lg font-semibold text-red-600">
                        {formatCurrency(loan.totalAmount - repaidAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Repayment Progress</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${isFullyPaid ? 'bg-green-500' : 'bg-primary'}`} 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {loan.interestRate && (
                    <div className="text-sm mb-4">
                      <span className="text-muted-foreground">Interest Rate: </span>
                      {loan.interestRate}
                    </div>
                  )}

                  {loan.notes && (
                    <div className="text-sm mb-4 p-3 bg-muted rounded-md">
                      {loan.notes}
                    </div>
                  )}

                  <div className="mt-auto pt-4 border-t">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">Repayment History</h4>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setSelectedLoan(loan);
                          setIsRepaymentDialogOpen(true);
                        }}
                        disabled={isFullyPaid}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    
                    {repayments.length > 0 ? (
                      <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                        {repayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((rep, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                            <span>{formatDate(rep.date)}</span>
                            <span className="font-medium text-green-600">{formatCurrency(rep.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        No repayments yet
                      </div>
                    )}
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Loan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lender">Lender</Label>
              <Input
                id="edit-lender"
                required
                value={formData.lender}
                onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-totalAmount">Total Amount</Label>
                <Input
                  id="edit-totalAmount"
                  type="number"
                  step="0.01"
                  required
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-loanType">Type</Label>
                <Select
                  value={formData.loanType}
                  onValueChange={(value) => setFormData({ ...formData, loanType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Family">Family</SelectItem>
                    <SelectItem value="Friend">Friend</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">Start Date</Label>
                <Input
                  id="edit-startDate"
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dueDate">Due Date (Optional)</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-interestRate">Interest Rate (Optional)</Label>
              <Input
                id="edit-interestRate"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Loan
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Repayment Dialog */}
      <Dialog open={isRepaymentDialogOpen} onOpenChange={(open) => {
        setIsRepaymentDialogOpen(open);
        if (!open) {
          setSelectedLoan(null);
          setRepaymentData({
            amount: "",
            date: new Date().toISOString().split("T")[0],
          });
        }
      }}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Add Repayment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRepaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rep-amount">Amount</Label>
              <Input
                id="rep-amount"
                type="number"
                step="0.01"
                required
                value={repaymentData.amount}
                onChange={(e) => setRepaymentData({ ...repaymentData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-date">Date</Label>
              <Input
                id="rep-date"
                type="date"
                required
                value={repaymentData.date}
                onChange={(e) => setRepaymentData({ ...repaymentData, date: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={addRepaymentMutation.isPending}>
              {addRepaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Repayment
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
