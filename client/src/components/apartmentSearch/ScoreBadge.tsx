import { cn } from "@/lib/utils";

/**
 * Renders a candidate's numeric score as a small graded chip (e.g. "8/10").
 * Color steps with the value so strong/weak candidates read at a glance. Shows
 * a muted dash when unscored.
 */
export function ScoreBadge({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
          className
        )}
      >
        —
      </span>
    );
  }

  const tone =
    value >= 8
      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
      : value >= 5
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        tone,
        className
      )}
    >
      {value}
      <span className="text-[10px] font-normal opacity-70">/10</span>
    </span>
  );
}
