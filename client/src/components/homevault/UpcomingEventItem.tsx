import { format } from "date-fns";
import { cn } from "@/lib/utils";

export type UpcomingEventItemProps = {
  date: Date | string;
  title: string;
  subtitle?: string;
  amount?: string;
  onClick?: () => void;
};

/**
 * A calm "Upcoming" row from the concept: a square day tile on the leading edge
 * and the commitment beside it. Any amount/time lives in the subtitle, keeping
 * the row uncluttered.
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
        "grid w-full grid-cols-[50px_1fr] items-center gap-3 rounded-[14px] py-1.5 text-start transition-colors",
        onClick && "hover:bg-hv-surface-muted"
      )}
    >
      <div className="flex h-[50px] w-[50px] items-center justify-center rounded-[14px] border border-hv-border bg-hv-surface-muted text-[18px] font-extrabold tracking-[-0.02em] text-hv-primary">
        {format(d, "d")}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-hv-ink">
          {title}
        </p>
        {(subtitle || amount) && (
          <p className="truncate text-[13px] text-hv-muted">
            {[subtitle, amount].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </button>
  );
}

export default UpcomingEventItem;
