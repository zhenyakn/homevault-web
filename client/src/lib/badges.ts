// Shared status / priority badge color tokens.
//
// Both the Repairs and Upgrades features render status & priority pills; before
// this module each page kept its own copy of the colour map, which let them
// drift apart (e.g. `in_progress` was indigo on Repairs but blue on Upgrades).
// Keeping the maps in one place makes drift impossible.
//
// Keys are the union of all repair + upgrade status values defined in the
// drizzle schema. The accent map is for the priority-accent left border used on
// list rows.

export const STATUS_BADGE: Record<string, string> = {
  idea: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  planning:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  open: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  in_progress:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  waiting_for_parts:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  waiting_for_contractor:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  completed:
    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

export const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  medium:
    "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  urgent: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

export const PRIORITY_ACCENT: Record<string, string> = {
  low: "ltr:border-l-zinc-300 rtl:border-r-zinc-300 dark:ltr:border-l-zinc-600 dark:rtl:border-r-zinc-600",
  medium: "ltr:border-l-yellow-400 rtl:border-r-yellow-400",
  high: "ltr:border-l-orange-400 rtl:border-r-orange-400",
  urgent: "ltr:border-l-red-500 rtl:border-r-red-500",
};

export function statusBadgeClass(status: string | null | undefined): string {
  return STATUS_BADGE[status ?? ""] ?? STATUS_BADGE.open;
}

export function priorityBadgeClass(
  priority: string | null | undefined
): string {
  return PRIORITY_BADGE[priority ?? ""] ?? PRIORITY_BADGE.medium;
}

export function priorityAccentClass(
  priority: string | null | undefined
): string {
  return PRIORITY_ACCENT[priority ?? ""] ?? PRIORITY_ACCENT.medium;
}
