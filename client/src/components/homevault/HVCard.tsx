import { cn } from "@/lib/utils";

export type HVCardProps = {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Removes the inner padding when you need full-bleed content (e.g. tables). */
  flush?: boolean;
};

/**
 * The base surface for the HomeVault premium UI: warm white card, soft border,
 * subtle shadow and a mature 22px radius. Pair an `eyebrow` (small uppercase
 * label) and `title` with an optional `action` in the header.
 */
export function HVCard({
  title,
  eyebrow,
  action,
  children,
  className,
  flush,
}: HVCardProps) {
  const hasHeader = Boolean(title || eyebrow || action);
  return (
    <div
      className={cn(
        "h-full rounded-[var(--hv-radius-xl)] border border-hv-border bg-hv-surface shadow-[var(--hv-shadow-card)]",
        flush ? "" : "p-5 md:p-6",
        className
      )}
    >
      {hasHeader && (
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            flush ? "px-5 pt-5 md:px-6 md:pt-6" : "",
            children ? "mb-4" : ""
          )}
        >
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-hv-muted-soft">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="mt-0.5 truncate text-[15px] font-bold tracking-tight text-hv-ink">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default HVCard;
