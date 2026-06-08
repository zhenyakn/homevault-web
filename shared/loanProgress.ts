/**
 * Single source of truth for loan repayment progress.
 *
 * `currentBalance` is the authoritative outstanding balance. It is seeded when a
 * loan is created — and may already be below `originalAmount` for a loan that was
 * partially paid down *before* it started being tracked here — and is kept in
 * sync whenever a repayment is added/removed or a linked expense is paid.
 *
 * Both the Dashboard and the Loans page derive progress from this helper so the
 * two views can never disagree (previously the Dashboard used `currentBalance`
 * while the Loans page summed the in-app repayment ledger, which ignored any
 * pre-tracking paydown — producing e.g. "7% repaid" vs "0% repaid").
 *
 * All amounts are integers in the smallest currency unit (e.g. agorot/cents).
 */
export interface LoanProgress {
  /** Principal repaid so far = originalAmount − remaining. */
  repaid: number;
  /** Outstanding balance, clamped to [0, originalAmount]. */
  remaining: number;
  /** Whole-number percentage repaid (0–100). */
  pct: number;
  /** True once the loan is fully repaid. */
  paidOff: boolean;
}

export function computeLoanProgress(
  originalAmount: number,
  currentBalance: number | null | undefined
): LoanProgress {
  const original = Math.max(0, originalAmount ?? 0);
  // A null/undefined balance means "untouched" → full balance outstanding.
  const balance =
    currentBalance == null ? original : Math.max(0, currentBalance);
  const remaining = Math.min(original, balance);
  const repaid = Math.max(0, original - remaining);
  const pct = original > 0 ? Math.round((repaid / original) * 100) : 0;
  return { repaid, remaining, pct, paidOff: original > 0 && remaining <= 0 };
}
