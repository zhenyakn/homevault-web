import { useTranslation } from "react-i18next";
import { Paperclip, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill, type StatusTone } from "./StatusPill";

export type ExpenseStatus = "paid" | "unpaid" | "overdue" | "upcoming";
export type ReceiptStatus = "uploaded" | "missing" | "none";

export type ExpenseRowProps = {
  label: string;
  category: string;
  dueLabel: string;
  amount: string;
  status?: ExpenseStatus;
  receiptStatus?: ReceiptStatus;
  action?: React.ReactNode;
  onClick?: () => void;
};

const STATUS_TONE: Record<ExpenseStatus, StatusTone> = {
  paid: "success",
  unpaid: "warning",
  overdue: "danger",
  upcoming: "info",
};

/**
 * A single expense, presented as a responsive row: a clean table line on
 * desktop and a stacked card on mobile. Shows category, due/paid date, amount,
 * payment status and whether a receipt is on file.
 */
export function ExpenseRow({
  label,
  category,
  dueLabel,
  amount,
  status,
  receiptStatus = "none",
  action,
  onClick,
}: ExpenseRowProps) {
  const { t } = useTranslation();

  const receipt =
    receiptStatus === "uploaded" ? (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-hv-primary">
        <Paperclip className="h-3 w-3" />
        {t("homevault.receiptUploaded")}
      </span>
    ) : receiptStatus === "missing" ? (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-hv-orange">
        <FileWarning className="h-3 w-3" />
        {t("homevault.receiptMissing")}
      </span>
    ) : (
      <span className="text-[11.5px] text-hv-muted-soft">—</span>
    );

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 border-b border-hv-border p-3 last:border-b-0 sm:grid sm:grid-cols-[1.6fr_1fr_1fr_auto] sm:items-center sm:gap-3",
        onClick && "cursor-pointer transition-colors hover:bg-hv-surface-muted"
      )}
    >
      {/* Label + category */}
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-hv-ink">
          {label}
        </p>
        <p className="text-[11.5px] text-hv-muted">{category}</p>
      </div>

      {/* Due / paid date */}
      <div className="text-[12.5px] text-hv-muted sm:text-start">
        {dueLabel}
      </div>

      {/* Status + receipt */}
      <div className="flex items-center gap-2 sm:flex-col sm:items-start">
        {status && (
          <StatusPill tone={STATUS_TONE[status]}>
            {t(`homevault.expenseStatus.${status}`)}
          </StatusPill>
        )}
        <span className="sm:mt-0.5">{receipt}</span>
      </div>

      {/* Amount + action */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="text-[14px] font-bold tabular-nums text-hv-ink">
          {amount}
        </span>
        {action}
      </div>
    </div>
  );
}

export default ExpenseRow;
