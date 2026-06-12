import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "@/components/FileUpload";

export type LogPaymentValues = {
  amount: number; // in cents
  date: string; // YYYY-MM-DD
  notes?: string;
  receipt?: string;
};

// Shared payment dialog used by both Repairs and Upgrades detail pages. The
// caller wires the feature-specific tRPC mutation via `onSubmit`. The dialog
// owns the input state and resets it when closed.

export function LogPaymentDialog({
  open,
  onOpenChange,
  title,
  amountLabel,
  submitLabel,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  amountLabel: string;
  submitLabel: string;
  onSubmit: (values: LogPaymentValues) => Promise<void> | void;
  isPending?: boolean;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<{
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setNotes("");
      setReceipt(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      toast.error(t("common.validAmount"));
      return;
    }
    await onSubmit({
      amount: Math.round(parseFloat(amount) * 100),
      date,
      notes: notes || undefined,
      receipt: receipt?.url,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">{amountLabel}</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-date">{t("common.date")}</Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">{t("common.notes")}</Label>
            <Input
              id="payment-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("common.receipt")} ({t("common.optional")})
            </Label>
            <FileUpload
              onUpload={f => setReceipt(f)}
              existingFiles={receipt ? [receipt] : []}
              onRemove={() => setReceipt(null)}
              maxFiles={1}
              accept="image/*,.pdf"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending && (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              )}
              {submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
