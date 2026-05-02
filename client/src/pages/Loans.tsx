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
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { useAttachments } from "@/hooks/useAttachments";

export default function Loans() {
  const { t } = useTranslation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRepaymentDialogOpen, setIsRepaymentDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  // Buffer for new-loan attachments (no id yet)
  const [newAttachments, setNewAttachments] = useState<string[]>([]);

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
      toast.success(t("loans.updateLoan"));
      setIsEditDialogOpen(false);
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

  const addRepaymentMutation = trpc.loans.addRepayment.useMutation({
    onSuccess: () => {
      toast.success(t("loans.addRepayment"));
      setIsRepaymentDialogOpen(false);
      setRepaymentData({
        amount: "",
        date: new Date().toISOString().split("T")[0],
      });
      utils.loans.list.invalidate();
    },
    onError: (error) => {
      toast.error(`${t("loans.failedAddRepayment")}: ${error.message}`);
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
    setNewAttachments([]);
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
    if (confirm(t("loans.deleteConfirm"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = Math.round(parseFloat(formData.totalAmount) * 100);

    if (isNaN(amountInCents) || amountInCents <= 0) {
      toast.error(t("common.validAmount"));
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
        data: { ...payload, attachments: selectedLoan.attachments ?? [] },
      });
    } else {
      createMutation.mutate({ ...payload, attachments: newAttachments });
    }
  };

  const handleRepaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const amountInCents = Math.round(parseFloat(repaymentData.amount) * 100);

    if (isNaN(amountInCents) || amountInCents <= 0) {
      toast.error(t("common.validAmount"));
      return;
    }

    addRepaymentMutation.mutate({
      loanId: selectedLoan.id,
      amount: amountInCents,
      date: repaymentData.date,
    });
  };

  const handleExportCSV = () => {
    if (!loans || loans.length === 0) { toast.error(t("loans.nothingToExport")); return; }
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
    toast.success(t("loans.exported"));
  };

  // Sub-component so useAttachments hook is only called when editing a real id
  function EditLoanAttachments({ loan }: { loan: any }) {
    const onChange = useAttachments("loan", loan.id);
    return (
      <div className="space-y-1.5">
        <Label>{t("common.attachments")}</Label>
        <AttachmentsPanel attachments={loan.attachments ?? []} onChange={onChange} />
      </div>
    );
  }

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

  const loanForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lender">{t("loans.lender")}</Label>
        <Input
          id="lender"
          required
          value={formData.lender}
          onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
          placeholder={t("loans.placeholderLender")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="totalAmount">{t("loans.totalAmount")}</Label>
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
          <Label htmlFor="loanType">{t("common.type")}</Label>
          <Select
            value={formData.loanType}
            onValueChange={(value) => setFormData({ ...formData, loanType: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("common.select") + " " + t("common.type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Bank">{t("loanType.Bank")}</SelectItem>
              <SelectItem value="Family">{t("loanType.Family")}</SelectItem>
              <SelectItem value="Friend">{t("loanType.Friend")}</SelectItem>
              <SelectItem value="Other">{t("loanType.Other")}</SelectItem>
            </SelectContent>
          </Select>
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
          <Label htmlFor="dueDate">{t("common.dueDate")} ({t("common.optional")})</Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          />
        </div>
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
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t("loans.addNewLoan")}</DialogTitle>
              </DialogHeader>
              {loanForm}
              <div className="space-y-1.5 mt-2">
                <Label>{t("common.attachments")}</Label>
                <AttachmentsPanel attachments={newAttachments} onChange={setNewAttachments} />
              </div>
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
                      <Badge variant={isFullyPaid ? "default" : "secondary"} className={isFullyPaid ? "bg-green-600 text-white" : ""}>
                        {isFullyPaid ? t("common.paidOff") : t(`loanType.${loan.loanType}`, { defaultValue: loan.loanType })}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(loan.startDate)}{loan.dueDate && ` → ${formatDate(loan.dueDate)}`}
                      {loan.interestRate && ` · ${loan.interestRate}% ${t("loans.interest")}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setSelectedLoan(loan); setIsRepaymentDialogOpen(true); }} disabled={isFullyPaid}>
                      + {t("loans.repay")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(loan)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(loan.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("loans.repaid")}: {formatCurrency(repaidAmount)} {t("loans.of")} {formatCurrency(loan.totalAmount)}</span>
                    <span className="tabular-nums">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-border overflow-hidden"><div className={`h-full transition-all ${isFullyPaid?"bg-green-500":"bg-foreground/70"}`} style={{width:`${progress}%`}} /></div>
                </div>
                {repayments.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {repayments.slice(0,3).map((rep,idx) => (
                      <span key={idx} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{formatDate(rep.date)} · {formatCurrency(rep.amount)}</span>
                    ))}
                    {repayments.length > 3 && <span className="text-xs text-muted-foreground">{t("loans.moreRepayments", { count: repayments.length - 3 })}</span>}
                  </div>
                )}
                <div className="mt-auto pt-4 border-t mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-sm">{t("loans.repaymentHistory")}</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedLoan(loan); setIsRepaymentDialogOpen(true); }}
                      disabled={isFullyPaid}
                    >
                      <Plus className="h-3 w-3 me-1" /> {t("common.add")}
                    </Button>
                  </div>

                  {repayments.length > 0 ? (
                    <div className="space-y-2 max-h-32 overflow-y-auto pe-2">
                      {repayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((rep, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                          <span>{formatDate(rep.date)}</span>
                          <span className="font-medium text-green-600">{formatCurrency(rep.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      {t("loans.noRepayments")}
                    </div>
                  )}
                </div>

                {/* Attachments — live-persisted via useAttachments */}
                {loan.attachments && loan.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2">{t("common.attachments")}</p>
                    <EditLoanAttachments loan={loan} />
                  </div>
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("loans.editLoan")}</DialogTitle>
          </DialogHeader>
          {loanForm}
          {selectedLoan && <EditLoanAttachments loan={selectedLoan} />}
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
            <DialogTitle>{t("loans.addRepayment")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRepaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rep-amount">{t("common.amount")}</Label>
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
              <Label htmlFor="rep-date">{t("common.date")}</Label>
              <Input
                id="rep-date"
                type="date"
                required
                value={repaymentData.date}
                onChange={(e) => setRepaymentData({ ...repaymentData, date: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={addRepaymentMutation.isPending}>
              {addRepaymentMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("loans.addRepayment")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
