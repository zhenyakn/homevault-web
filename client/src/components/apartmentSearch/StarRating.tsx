import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact 1–5 star control. Read-only when `onChange` is omitted (used to
 * display a candidate's rating); interactive otherwise (used in the dialog).
 */
export function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
}) {
  const readOnly = !onChange;
  const px = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            aria-label={`${star}`}
            onClick={() => onChange?.(star === value ? 0 : star)}
            className={cn(
              "transition-transform",
              !readOnly && "hover:scale-110 cursor-pointer",
              readOnly && "cursor-default"
            )}
          >
            <Star
              className={cn(
                px,
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
