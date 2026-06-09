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

/**
 * KPI tile from the concept: an uppercase label, a large tight-tracked value in
 * tabular figures, and a calm helper line. Deliberately icon-free to stay close
 * to the reference and avoid a templated dashboard feel.
 */
export function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
  onClick,
}: MetricCardProps) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col rounded-[var(--hv-radius-xl)] border border-hv-border bg-hv-surface p-5 text-start shadow-[var(--hv-shadow-card)]",
        onClick && "transition-colors hover:border-hv-primary/30"
      )}
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-hv-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums",
          TONE_VALUE[tone]
        )}
      >
        {value}
      </p>
      {helper && (
        <p className="mt-1.5 text-[13px] leading-snug text-hv-muted">
          {helper}
        </p>
      )}
    </Wrapper>
  );
}

export default MetricCard;
