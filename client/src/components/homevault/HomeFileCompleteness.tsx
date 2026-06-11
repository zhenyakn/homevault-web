import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type HomeFileCompletenessProps = {
  percentage: number;
  missing?: string[];
  /** Compact variant for the sidebar footer widget. */
  compact?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * Shows how complete the "home file" is — the share of important documents on
 * record. Used both as a dashboard card and as a sidebar footer widget
 * (compact). The percentage is intentionally forgiving when data is missing.
 */
export function HomeFileCompleteness({
  percentage,
  missing = [],
  compact,
  onClick,
  className,
}: HomeFileCompletenessProps) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-[14px] border border-hv-sidebar-border bg-hv-sidebar-soft px-3 py-2.5 text-start transition-colors hover:brightness-110",
          className
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-white">
            {t("homevault.homeFile")}
          </p>
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-white/55">
            {pct}%
          </span>
        </div>
        <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-[#3b4b40]">
          <div
            className="h-full rounded-full bg-hv-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
    );
  }

  return (
    <div className={cn("", className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold tracking-tight text-hv-ink">
          {t("homevault.homeFileComplete", { pct })}
        </p>
        <span className="text-[13px] font-bold tabular-nums text-hv-primary">
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-hv-surface-muted">
        <div
          className="h-full rounded-full bg-hv-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-[12px] text-hv-muted">
          <span className="font-medium text-hv-muted-soft">
            {t("homevault.missing")}:{" "}
          </span>
          {missing.join(", ")}
        </p>
      )}
    </div>
  );
}

export default HomeFileCompleteness;
