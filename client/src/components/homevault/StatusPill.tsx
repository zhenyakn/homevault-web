import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "gold";

export type StatusPillProps = {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
};

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-hv-surface-muted text-hv-muted border-hv-border",
  success: "bg-hv-primary-soft text-hv-primary border-hv-primary/20",
  warning: "bg-hv-warning-bg text-hv-orange border-hv-orange/20",
  danger: "bg-hv-danger-bg text-hv-red border-hv-red/20",
  info: "bg-[#eaf1f8] text-hv-blue border-hv-blue/20",
  // `--hv-accent` (#d6a85d) on the cream pill is only ~1.9:1 — illegible. Use a
  // deeper bronze gold for the text so the label clears WCAG AA, keeping the
  // decorative accent token untouched for its other (icon/value) uses.
  gold: "bg-[#f7efdf] text-[#8a6418] border-hv-accent/40",
};

/**
 * Small status chip — "Overdue", "Missing", "High", "Soon", "Paid", "Waiting".
 * Calm, bordered, semantic colours only.
 */
export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-bold leading-none",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export default StatusPill;
