import { cn } from "@/lib/utils";

export type ActionTone = "success" | "warning" | "danger" | "info" | "neutral";

export type ActionItemProps = {
  title: string;
  description?: string;
  amount?: string;
  status?: string;
  tone?: ActionTone;
  actionLabel: string;
  onAction?: () => void;
  icon?: React.ReactNode;
};

// The action reads as a soft pill whose colour carries the urgency — matching
// the concept (Pay = red, Upload/Review = amber, View = green).
const PILL_CLASS: Record<ActionTone, string> = {
  danger: "bg-hv-danger-bg text-hv-red",
  warning: "bg-hv-warning-bg text-hv-orange",
  info: "bg-[#eaf1f8] text-hv-blue",
  success: "bg-hv-primary-soft text-hv-primary",
  neutral: "bg-hv-primary-soft text-hv-primary",
};

/**
 * A single row inside "Things to handle". Mirrors the reference exactly: a calm
 * white card with the item on the left, an amount, and a coloured action pill —
 * no left rail or icon chip, so the surface stays premium and uncluttered.
 */
export function ActionItem({
  title,
  description,
  amount,
  status,
  tone = "neutral",
  actionLabel,
  onAction,
}: ActionItemProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[16px] border border-hv-border bg-hv-item px-3.5 py-3">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-hv-ink">
          {title}
        </p>
        {(description || status) && (
          <p className="mt-1 truncate text-[12.5px] text-hv-muted">
            {description}
            {status && (
              <span className="ms-1 font-medium text-hv-muted-soft">
                · {status}
              </span>
            )}
          </p>
        )}
      </div>
      <span className="whitespace-nowrap text-[14px] font-bold tabular-nums text-hv-ink">
        {amount}
      </span>
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition-opacity hover:opacity-80",
          PILL_CLASS[tone]
        )}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default ActionItem;
