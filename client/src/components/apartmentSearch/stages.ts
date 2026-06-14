// Candidate pipeline stages. `accepted` and `rejected` are terminal decisions;
// the linear stepper walks saved → … → accepted, while `rejected` is reached
// via a dedicated "pass" action rather than a forward step.
export const CANDIDATE_STAGES = [
  "saved",
  "viewing_scheduled",
  "viewed",
  "applied",
  "accepted",
  "rejected",
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const STAGE_STEPS: readonly CandidateStage[] = [
  "saved",
  "viewing_scheduled",
  "viewed",
  "applied",
  "accepted",
];

/** Tailwind classes for a soft, AA-contrast stage pill. */
export function stageColor(stage: string): string {
  switch (stage) {
    case "accepted":
      return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
    case "rejected":
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
    case "applied":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";
    case "viewed":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
    case "viewing_scheduled":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    case "saved":
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}
