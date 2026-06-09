import { cn } from "@/lib/utils";

export type MetricTone =
  | "neutral"
  | "green"
  | "blue"
  | "orange"
  | "red"
  | "gold";

export type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  tone?: MetricTone;
  icon?: React.ReactNode;
  onClick?: () => void;
};

const TONE_VALUE: Record<MetricTone, string> = {
  neutral: "text-hv-ink",
  green: "text-hv-green",
  blue: "text-hv-blue",
  orange: "text-hv-orange",
  red: "text-hv-red",
  gold: "text-hv-accent",
};

const TONE_ICON: Record<MetricTone, string> = {
  neutral: "bg-hv-surface-muted text-hv-muted",
  green: "bg-hv-primary-soft text-hv-primary",
  blue: "bg-[#eaf1f8] text-hv-blue",
  orange: "bg-hv-warning-bg text-hv-orange",
  red: "bg-hv-danger-bg text-hv-red",
  gold: "bg-[#f7efdf] text-hv-accent",
};

/**
 * Compact KPI tile used across the Today/Expenses headers. The value uses
 * tabular figures so money and counts line up neatly across a row.
 */
export function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
  icon,
  onClick,
}: MetricCardProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col rounded-[var(--hv-radius-lg)] border border-hv-border bg-hv-surface p-4 text-start shadow-[var(--hv-shadow-card)]",
        onClick &&
          "transition-colors hover:border-hv-primary/30 hover:bg-hv-surface-muted"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-hv-muted">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              TONE_ICON[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums",
          TONE_VALUE[tone]
        )}
      >
        {value}
      </p>
      {helper && (
        <p className="mt-2 text-[12px] leading-snug text-hv-muted-soft">
          {helper}
        </p>
      )}
    </Wrapper>
  );
}

export default MetricCard;
