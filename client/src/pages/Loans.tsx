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
import { Loader2, Plus, Trash2, Edit, Landmark, Banknote, Calendar, ArrowRight } from "lucide-react";
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
        <h1 className="text-3xl font-bold tracking-tight">Loans</h1>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Borrowed</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBorrowed)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Repaid</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRepaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(outstandingBalance)}</div>
          </CardContent>
        </Card>
      </div>

      {loans?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Landmark className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No loans found</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first loan to start tracking.</p>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Loan
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {loans?.map((loan) => {
            const repayments = loan.repayments as any[] || [];
            const repaidAmount = repayments.reduce((sum, r) => sum + r.amount, 0);
            const progress = loan.totalAmount > 0 ? Math.min(100, (repaidAmount / loan.totalAmount) * 100) : 0;
            const isFullyPaid = repaidAmount >= loan.totalAmount;

            return (
              <Card key={loan.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {loan.lender}
                        <Badge variant={isFullyPaid ? "default" : "secondary"} className={isFullyPaid ? "bg-green-600" : ""}>
                          {isFullyPaid ? "Paid Off" : loan.loanType}
                        </Badge>
                      </CardTitle>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(loan.startDate)}
                        </span>
                        {loan.dueDate && (
                          <span className="flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            {formatDate(loan.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(loan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(loan.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
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
                </CardContent>
              </Card>
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
