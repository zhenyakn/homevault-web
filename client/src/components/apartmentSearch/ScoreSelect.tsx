import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ScoreBadge } from "./ScoreBadge";

/**
 * Inline 1–10 score picker used in the candidate list so apartments can be
 * rated in place — after viewing — without opening the edit form. Selecting the
 * "clear" row (value 0) removes the score.
 */
export function ScoreSelect({
  value,
  onChange,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (score: number | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={value != null ? String(value) : undefined}
      onValueChange={v => onChange(Number(v) === 0 ? undefined : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={t("apartmentSearch.scoreLabel")}
        className="h-7 gap-1 border-dashed px-2"
      >
        {value != null ? (
          <ScoreBadge value={value} className="px-0" />
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("apartmentSearch.rate")}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="0">{t("apartmentSearch.clearScore")}</SelectItem>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <SelectItem key={n} value={String(n)}>
            {n}/10
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
