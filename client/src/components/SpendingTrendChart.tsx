import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/utils";

type Row = { date: string; amount: number };

/**
 * Last-6-months spending as a dependency-free bar chart (plain divs — no
 * charting library, so it ships even when network install is restricted).
 * Renders nothing until there is at least one expense to plot.
 */
export default function SpendingTrendChart({ expenses }: { expenses: Row[] }) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString(undefined, { month: "short" }),
        total: 0,
      };
    });
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const e of expenses) {
      const i = idx.get(e.date.slice(0, 7));
      if (i != null) months[i].total += e.amount;
    }
    return months;
  }, [expenses]);

  const max = Math.max(1, ...data.map(m => m.total));
  if (!data.some(m => m.total > 0)) return null;

  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-3">
        {t("expenses.last6Months")}
      </p>
      <div className="flex items-end gap-2">
        {data.map(m => (
          <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground h-3">
              {m.total > 0 ? formatCurrency(m.total) : ""}
            </span>
            <div className="w-full h-24 flex items-end">
              <div
                className="w-full rounded-t bg-primary/70 transition-all"
                style={{
                  height: `${Math.max((m.total / max) * 100, m.total > 0 ? 4 : 0)}%`,
                }}
                title={formatCurrency(m.total)}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
