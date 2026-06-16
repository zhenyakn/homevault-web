import { useTranslation } from "react-i18next";
import { User, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill, type StatusTone } from "./StatusPill";

export type RepairPriority = "low" | "medium" | "high" | "urgent";
export type RepairStatus = "open" | "waiting" | "done";

export type RepairCardProps = {
  title: string;
  priority?: RepairPriority;
  status: RepairStatus;
  estimate?: string;
  nextStep?: string;
  contractor?: string;
  onClick?: () => void;
};

const PRIORITY_TONE: Record<RepairPriority, StatusTone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

/**
 * A repair, shown as a calm card on the Open / Waiting / Done board. Leads with
 * the title and priority, then the next step, with the contractor and estimate
 * on the footer. Deliberately avoids ticketing-software language.
 */
export function RepairCard({
  title,
  priority,
  status,
  estimate,
  nextStep,
  contractor,
  onClick,
}: RepairCardProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-[16px] border border-hv-border bg-hv-item p-2.5 text-start shadow-[var(--hv-shadow-card)] transition-colors hover:border-hv-primary/30 md:gap-2.5 md:p-3.5",
        status === "done" && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-semibold leading-snug text-hv-ink">
          {title}
        </p>
        {priority && (
          <StatusPill tone={PRIORITY_TONE[priority]}>
            {t(`homevault.priority.${priority}`)}
          </StatusPill>
        )}
      </div>

      {nextStep && (
        <p className="flex items-center gap-1.5 text-[12px] text-hv-muted">
          <ArrowRight className="h-3 w-3 shrink-0 text-hv-muted-soft rtl:rotate-180" />
          <span className="truncate">{nextStep}</span>
        </p>
      )}

      {(contractor || estimate) && (
        <div className="flex items-center justify-between border-t border-hv-border pt-2 md:pt-2.5">
          {contractor ? (
            <span className="inline-flex items-center gap-1.5 truncate text-[12px] text-hv-muted">
              <User className="h-3 w-3 shrink-0" />
              {contractor}
            </span>
          ) : (
            <span />
          )}
          {estimate && (
            <span className="text-[13px] font-bold tabular-nums text-hv-ink">
              {estimate}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export default RepairCard;
