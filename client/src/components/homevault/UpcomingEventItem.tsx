import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type UpcomingEventItemProps = {
  date: Date | string;
  title: string;
  subtitle?: string;
  amount?: string;
  onClick?: () => void;
};

/**
 * A calm row for the "Upcoming" list — a calendar tile on the leading edge,
 * the commitment in the middle, and an optional amount/chevron trailing.
 */
export function UpcomingEventItem({
  date,
  title,
  subtitle,
  amount,
  onClick,
}: UpcomingEventItemProps) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--hv-radius-md)] px-2 py-2 text-start transition-colors",
        onClick && "hover:bg-hv-surface-muted"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-hv-primary-soft">
        <span className="text-[15px] font-extrabold leading-none text-hv-primary">
          {format(d, "d")}
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-wide text-hv-primary/70">
          {format(d, "MMM")}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-hv-ink">{title}</p>
        {subtitle && (
          <p className="truncate text-[11.5px] text-hv-muted">{subtitle}</p>
        )}
      </div>
      {amount && (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-hv-ink">
          {amount}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hv-muted-soft" />
    </button>
  );
}

export default UpcomingEventItem;
