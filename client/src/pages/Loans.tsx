import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
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
import { Loader2, Plus, Trash2, Edit, Download } from "lucide-react";
import { toast } from "sonner";

export default function Loans() {
  const { t } = useTranslation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRepaymentDialogOpen, setIsRepaymentDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    lender: "",
    originalAmount: "",
    currentBalance: "",
    loanType: "personal" as "mortgage" | "heloc" | "personal" | "construction" | "other",
    interestRate: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    nextPaymentDate: "",
    monthlyPayment: "",
    notes: "",
  });

  const [repaymentData, setRepaymentData] = useState({
    amount: "",
  });

  const utils = trpc.useUtils();
  const { data: loans, isLoading } = trpc.loans.list.useQuery();

  const createMutation = trpc.loans.create.useMutation({
    onSuccess: () => {
      toast.success(t("loans.addLoan"));
      setIsAddDialogOpen(false);
      resetForm();
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`${t("loans.failedAdd")}: ${error.message}`);
    },
  });

  const updateMutation = trpc.loans.update.useMutation({
    onSuccess: () => {
      toast.success(t("loans.saveLoan"));
      setIsEditDialogOpen(false);
      setIsRepaymentDialogOpen(false);
      resetForm();
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`${t("loans.failedUpdate")}: ${error.message}`);
    },
  });

  const deleteMutation = trpc.loans.delete.useMutation({
    onSuccess: () => {
      toast.success(t("loans.deleted"));
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`${t("loans.failedDeleteMsg")}: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      lender: "",
      originalAmount: "",
      currentBalance: "",
      loanType: "personal",
      interestRate: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      nextPaymentDate: "",
      monthlyPayment: "",
      notes: "",
    });
    setSelectedLoan(null);
  };

  const handleEdit = (loan: any) => {
    setSelectedLoan(loan);
    setFormData({
      name: loan.name || loan.lender || "",
      lender: loan.lender || "",
      originalAmount: (loan.originalAmount / 100).toString(),
      currentBalance: (loan.currentBalance / 100).toString(),
      loanType: loan.loanType || "personal",
      interestRate: loan.interestRate || "",
      startDate: loan.startDate || new Date().toISOString().split("T")[0],
      endDate: loan.endDate || "",
      nextPaymentDate: loan.nextPaymentDate || "",
      monthlyPayment: loan.monthlyPayment ? (loan.monthlyPayment / 100).toString() : "",
      notes: loan.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t("loans.deleteConfirm"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const originalAmountCents = Math.round(parseFloat(formData.originalAmount) * 100);
    const currentBalanceCents = formData.currentBalance
      ? Math.round(parseFloat(formData.currentBalance) * 100)
      : originalAmountCents;

    if (isNaN(originalAmountCents) || originalAmountCents <= 0) {
      toast.error(t("common.validAmount"));
      return;
    }

    const payload: any = {
      name: formData.name || formData.lender || "Loan",
      lender: formData.lender || undefined,
      originalAmount: originalAmountCents,
      currentBalance: currentBalanceCents,
      loanType: formData.loanType,
      interestRate: formData.interestRate || undefined,
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || undefined,
      nextPaymentDate: formData.nextPaymentDate || undefined,
      monthlyPayment: formData.monthlyPayment
        ? Math.round(parseFloat(formData.monthlyPayment) * 100)
        : undefined,
      notes: formData.notes || undefined,
    };

    if (selectedLoan) {
      updateMutation.mutate({ id: selectedLoan.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleRepaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const repaidCents = Math.round(parseFloat(repaymentData.amount) * 100);
    if (isNaN(repaidCents) || repaidCents <= 0) {
      toast.error(t("common.validAmount"));
      return;
    }

    const newBalance = Math.max(0, selectedLoan.currentBalance - repaidCents);
    updateMutation.mutate({
      id: selectedLoan.id,
      data: { currentBalance: newBalance },
    });
    setRepaymentData({ amount: "" });
  };

  const handleExportCSV = () => {
    if (!loans || loans.length === 0) { toast.error(t("loans.nothingToExport")); return; }
    const headers = ["Lender", "Type", "Original Amount", "Current Balance", "Repaid", "Interest Rate", "Start Date", "End Date", "Notes"];
    const rows = loans.map((l: any) => [
      l.lender || l.name,
      l.loanType,
      (l.originalAmount / 100).toFixed(2),
      (l.currentBalance / 100).toFixed(2),
      ((l.originalAmount - l.currentBalance) / 100).toFixed(2),
      l.interestRate || "",
      l.startDate || "",
      l.endDate || "",
      l.notes || "",
    ]);
    const csv = [headers, ...rows].map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `loans_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(t("loans.exported"));
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalBorrowed = loans?.reduce((sum, loan) => sum + loan.originalAmount, 0) || 0;
  const totalRepaid = loans?.reduce((sum, loan) => sum + Math.max(0, loan.originalAmount - loan.currentBalance), 0) || 0;
  const outstandingBalance = loans?.reduce((sum, loan) => sum + Math.max(0, loan.currentBalance), 0) || 0;

  const loanForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="loan-name">{t("common.name")}</Label>
        <Input
          id="loan-name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. Bank Leumi Mortgage"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lender">{t("loans.lender")} ({t("common.optional")})</Label>
        <Input
          id="lender"
          value={formData.lender}
          onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
          placeholder={t("loans.placeholderLender")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="originalAmount">{t("loans.totalAmount")}</Label>
          <Input
            id="originalAmount"
            type="number"
            step="0.01"
            required
            value={formData.originalAmount}
            onChange={(e) => setFormData({ ...formData, originalAmount: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentBalance">{t("loans.outstanding")}</Label>
          <Input
            id="currentBalance"
            type="number"
            step="0.01"
            value={formData.currentBalance}
            onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
            placeholder="same as total"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="loanType">{t("common.type")}</Label>
          <Select
            value={formData.loanType}
            onValueChange={(value: any) => setFormData({ ...formData, loanType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mortgage">Mortgage</SelectItem>
              <SelectItem value="heloc">HELOC</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="construction">Construction</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="interestRate">{t("common.interestRate")} ({t("common.optional")})</Label>
          <Input
            id="interestRate"
            value={formData.interestRate}
            onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
            placeholder={t("loans.placeholderInterest")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">{t("common.startDate")}</Label>
          <Input
            id="startDate"
            type="date"
            required
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">{t("common.dueDate")} ({t("common.optional")})</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="monthlyPayment">Monthly Payment ({t("common.optional")})</Label>
          <Input
            id="monthlyPayment"
            type="number"
            step="0.01"
            value={formData.monthlyPayment}
            onChange={(e) => setFormData({ ...formData, monthlyPayment: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nextPaymentDate">Next Payment ({t("common.optional")})</Label>
          <Input
            id="nextPaymentDate"
            type="date"
            value={formData.nextPaymentDate}
            onChange={(e) => setFormData({ ...formData, nextPaymentDate: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">{t("common.notes")} ({t("common.optional")})</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder={t("loans.placeholderNotes")}
        />
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("loans.title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 me-1.5" />{t("common.exportCsv")}
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="me-2 h-4 w-4" />
                {t("loans.addLoan")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("loans.addNewLoan")}</DialogTitle>
              </DialogHeader>
              {loanForm}
              <Button
                type="button"
                className="w-full mt-2"
                disabled={createMutation.isPending}
                onClick={(e) => handleSubmit(e as any)}
              >
                {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("loans.saveLoan")}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 border border-border rounded-lg divide-x divide-border overflow-hidden">
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("loans.totalBorrowed")}</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalBorrowed)}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("loans.totalRepaid")}</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(totalRepaid)}</p></div>
        <div className="px-4 py-3.5"><p className="text-xs text-muted-foreground">{t("loans.outstanding")}</p><p className="text-xl font-semibold tabular-nums mt-1">{formatCurrency(outstandingBalance)}</p></div>
      </div>

      {loans?.length === 0 ? (
        <div className="border border-border rounded-lg px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("loans.noLoans")}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t("loans.addLoan")}
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {loans?.map((loan) => {
            const repaidAmount = Math.max(0, loan.originalAmount - loan.currentBalance);
            const progress = loan.originalAmount > 0 ? Math.min(100, (repaidAmount / loan.originalAmount) * 100) : 0;
            const isFullyPaid = loan.currentBalance <= 0;

            return (
              <div key={loan.id} className="px-4 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{loan.lender || loan.name}</p>
                      <Badge variant={isFullyPaid ? "default" : "secondary"} className={isFullyPaid ? "bg-green-600 text-white" : ""}>
                        {isFullyPaid ? t("common.paidOff") : loan.loanType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {loan.startDate && formatDate(loan.startDate)}
                      {loan.endDate && ` → ${formatDate(loan.endDate)}`}
                      {loan.interestRate && ` · ${loan.interestRate}% ${t("loans.interest")}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => { setSelectedLoan(loan); setIsRepaymentDialogOpen(true); }}
                      disabled={isFullyPaid}
                    >
                      + {t("loans.repay")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(loan)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(loan.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("loans.repaid")}: {formatCurrency(repaidAmount)} {t("loans.of")} {formatCurrency(loan.originalAmount)}</span>
                    <span className="tabular-nums">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full transition-all ${isFullyPaid ? "bg-green-500" : "bg-foreground/70"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                {loan.nextPaymentDate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Next payment: {formatDate(loan.nextPaymentDate)}
                    {loan.monthlyPayment && ` · ${formatCurrency(loan.monthlyPayment)}`}
                  </p>
                )}
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
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("loans.editLoan")}</DialogTitle>
          </DialogHeader>
          {loanForm}
          <Button
            type="button"
            className="w-full mt-2"
            disabled={updateMutation.isPending}
            onClick={(e) => handleSubmit(e as any)}
          >
            {updateMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("loans.updateLoan")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Log Repayment Dialog */}
      <Dialog open={isRepaymentDialogOpen} onOpenChange={(open) => {
        setIsRepaymentDialogOpen(open);
        if (!open) {
          setSelectedLoan(null);
          setRepaymentData({ amount: "" });
        }
      }}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>{t("loans.addRepayment")}</DialogTitle>
          </DialogHeader>
          {selectedLoan && (
            <p className="text-sm text-muted-foreground -mt-2">
              Current balance: {formatCurrency(selectedLoan.currentBalance)}
            </p>
          )}
          <form onSubmit={handleRepaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rep-amount">{t("common.amount")} repaid</Label>
              <Input
                id="rep-amount"
                type="number"
                step="0.01"
                required
                value={repaymentData.amount}
                onChange={(e) => setRepaymentData({ amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("loans.addRepayment")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
