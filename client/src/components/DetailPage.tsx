import * as React from "react";
import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Pencil, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Shared scaffolding for the Repairs & Upgrades detail pages so the two
// features render through the same visual primitives. Callers pass
// already-translated strings via props — no hardcoded English.

// ── DetailHeader ─────────────────────────────────────────────────────────────

export function DetailHeader({
  backLabel,
  onBack,
  title,
  description,
  meta,
  editLabel,
  onEdit,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  description?: string | null;
  meta?: React.ReactNode;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {backLabel}
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {meta && <div className="flex items-center gap-2.5 flex-wrap mb-1">{meta}</div>}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} className="shrink-0">
          <Pencil className="h-3.5 w-3.5 me-1.5" />
          {editLabel}
        </Button>
      </div>
    </div>
  );
}

// ── StatusStepperCard ───────────────────────────────────────────────────────

export function StatusStepperCard({
  label,
  steps,
  currentStatus,
  onChange,
  loading,
  getStepLabel,
}: {
  label: string;
  steps: readonly string[];
  currentStatus: string;
  onChange: (status: string) => void;
  loading?: boolean;
  getStepLabel: (status: string) => string;
}) {
  const currentIdx = steps.indexOf(currentStatus);

  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">
        {label}
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-0 flex-wrap gap-y-2">
          {steps.map((s, i) => {
            const done = i < currentIdx;
            const active = s === currentStatus;
            const isLast = i === steps.length - 1;
            return (
              <div key={s} className="flex items-center">
                <button
                  type="button"
                  onClick={() => !loading && onChange(s)}
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap",
                    active && "bg-indigo-500 text-white border-indigo-500 shadow-sm",
                    done && "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50",
                    !active && !done && "bg-muted text-muted-foreground border-transparent hover:border-border",
                    loading && "opacity-50 cursor-wait",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                  {getStepLabel(s)}
                </button>
                {!isLast && (
                  <div
                    className={cn(
                      "h-px w-4 shrink-0",
                      i < currentIdx ? "bg-indigo-200 dark:bg-indigo-900/50" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── DetailSectionHeader ─────────────────────────────────────────────────────

export function DetailSectionHeader({
  label,
  count,
  countSuffix,
  action,
}: {
  label: string;
  count?: number;
  countSuffix?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">
          {label}
        </p>
        <div className="flex-1 h-px bg-border max-w-16" />
        {count !== undefined && count > 0 && (
          <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
            {count}{countSuffix ? ` ${countSuffix}` : ""}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

// ── DetailSummaryCard ───────────────────────────────────────────────────────

export type SummaryStat = {
  value: string;
  label: string;
  sub?: string;
  /** Render the value in muted foreground — for an "envelope/max" stat. */
  muted?: boolean;
};

export function DetailSummaryCard({
  stats,
  progress,
  progressLeft,
  progressRight,
}: {
  stats: SummaryStat[];
  progress: number;
  progressLeft?: string;
  progressRight?: string;
}) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div
        className={cn(
          "grid gap-2 text-center",
          stats.length === 3 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {stats.map((s, i) => (
          <div key={i} className="min-w-0">
            <p
              className={cn(
                "text-base font-bold tabular-nums",
                s.muted && "text-muted-foreground",
              )}
            >
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
              {s.label}
            </p>
            {s.sub && (
              <p className="text-[10px] text-muted-foreground truncate">{s.sub}</p>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all rounded-full"
            style={{ width: `${clamped}%` }}
          />
        </div>
        {(progressLeft || progressRight) && (
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{progressLeft}</span>
            <span>{progressRight}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── NotesCard ───────────────────────────────────────────────────────────────

export function NotesCard({ label, notes }: { label: string; notes?: string | null }) {
  if (!notes) return null;
  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">
        {label}
      </p>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notes}</p>
    </div>
  );
}

// ── CollapsibleCard ─────────────────────────────────────────────────────────

export function CollapsibleCard({
  header,
  headerActions,
  selected,
  defaultExpanded,
  children,
}: {
  header: React.ReactNode;
  headerActions?: React.ReactNode;
  selected?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-all",
        selected
          ? "border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-900/50"
          : "border-border",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-4 py-3",
          selected ? "bg-indigo-50/60 dark:bg-indigo-950/20" : "bg-muted/30",
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
        >
          {header}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
      {expanded && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

// ── Re-exports for convenience ──────────────────────────────────────────────

export { Loader2 };
