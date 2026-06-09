import { cn } from "@/lib/utils";
import { StatusPill, type StatusTone } from "./StatusPill";

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

const ACCENT: Record<ActionTone, string> = {
  danger: "bg-hv-red",
  warning: "bg-hv-orange",
  info: "bg-hv-blue",
  success: "bg-hv-primary",
  neutral: "bg-hv-muted-soft",
};

const PILL_TONE: Record<ActionTone, StatusTone> = {
  danger: "danger",
  warning: "warning",
  info: "info",
  success: "success",
  neutral: "neutral",
};

/**
 * A single row inside "Things to handle" — the most important surface in the
 * app. A coloured rail signals urgency, the body explains the item, and a
 * single clear action sits on the trailing edge.
 */
export function ActionItem({
  title,
  description,
  amount,
  status,
  tone = "neutral",
  actionLabel,
  onAction,
  icon,
}: ActionItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--hv-radius-md)] border border-hv-border bg-hv-surface p-3 transition-colors hover:bg-hv-surface-muted">
      <span
        className={cn("h-9 w-1 shrink-0 rounded-full", ACCENT[tone])}
        aria-hidden
      />
      {icon && (
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hv-surface-muted text-hv-muted sm:flex">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-hv-ink">
          {title}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {status && <StatusPill tone={PILL_TONE[tone]}>{status}</StatusPill>}
          {description && (
            <p className="truncate text-[12px] text-hv-muted">{description}</p>
          )}
        </div>
      </div>
      {amount && (
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-hv-ink">
          {amount}
        </span>
      )}
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-lg border border-hv-border bg-hv-surface px-3 py-1.5 text-[12px] font-semibold text-hv-primary-dark transition-colors hover:bg-hv-primary-soft"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default ActionItem;
