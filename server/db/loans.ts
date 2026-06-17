import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  loans,
  loanRepayments,
  expenses,
  type Loan,
  type LoanRepayment,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { getExpenseById } from "./expenses";

export type LoanWithRepayments = Loan & { repayments: LoanRepayment[] };

async function attachRepayments(
  loanRows: Loan[]
): Promise<LoanWithRepayments[]> {
  if (loanRows.length === 0) return [];
  const db = await getDb();
  const ids = loanRows.map(l => l.id);
  const repRows = await db
    .select()
    .from(loanRepayments)
    .where(inArray(loanRepayments.loanId, ids))
    .orderBy(loanRepayments.date);
  const byLoan: Record<string, LoanRepayment[]> = {};
  for (const r of repRows) {
    (byLoan[r.loanId] ??= []).push(r);
  }
  return loanRows.map(l => ({ ...l, repayments: byLoan[l.id] ?? [] }));
}

export async function getLoans(
  tenantId: number,
  propertyId: number,
  limit = 500,
  offset = 0
): Promise<LoanWithRepayments[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(loans)
    .where(and(eq(loans.tenantId, tenantId), eq(loans.propertyId, propertyId)))
    .orderBy(desc(loans.createdAt))
    .limit(limit)
    .offset(offset);
  return attachRepayments(rows);
}

export async function getLoanById(
  id: string,
  tenantId?: number
): Promise<LoanWithRepayments | null> {
  const db = await getDb();
  const result = await db
    .select()
    .from(loans)
    .where(
      tenantId == null
        ? eq(loans.id, id)
        : and(eq(loans.id, id), eq(loans.tenantId, tenantId))
    )
    .limit(1);
  if (!result[0]) return null;
  const [withRep] = await attachRepayments([result[0]]);
  return withRep;
}

export async function createLoan(data: typeof loans.$inferInsert) {
  const db = await getDb();
  await db.insert(loans).values({
    ...data,
    attachments: (data.attachments ?? []) as any,
  });
  return data;
}

export async function updateLoan(
  id: string,
  tenantId: number,
  data: Partial<Loan>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(loans)
    .set(normalized)
    .where(and(eq(loans.id, id), eq(loans.tenantId, tenantId)));
  return data;
}

export async function deleteLoan(id: string, tenantId: number) {
  const db = await getDb();
  // Clear dangling links so paid "Loan" expenses don't later try to reconcile
  // against a loan that no longer exists. Repayments cascade-delete via FK.
  await db
    .update(expenses)
    .set({ loanId: null })
    .where(eq(expenses.loanId, id));
  await db
    .delete(loans)
    .where(and(eq(loans.id, id), eq(loans.tenantId, tenantId)));
  return true;
}

// ── Loan repayments ───────────────────────────────────────────────────────────

export async function getLoanRepayments(
  loanId: string
): Promise<LoanRepayment[]> {
  const db = await getDb();
  return await db
    .select()
    .from(loanRepayments)
    .where(eq(loanRepayments.loanId, loanId))
    .orderBy(loanRepayments.date);
}

export async function createLoanRepayment(
  data: typeof loanRepayments.$inferInsert
): Promise<LoanRepayment> {
  const db = await getDb();
  await db.insert(loanRepayments).values(data);
  return data as LoanRepayment;
}

export async function deleteLoanRepayment(id: string, loanId: string) {
  const db = await getDb();
  await db
    .delete(loanRepayments)
    .where(and(eq(loanRepayments.id, id), eq(loanRepayments.loanId, loanId)));
  return true;
}

// ── Balance maintenance ───────────────────────────────────────────────────────

/**
 * Apply a repayment delta to a loan's outstanding balance.
 *
 * `currentBalance` is the single source of truth (see shared/loanProgress.ts):
 * a repayment of `amount` decreases it (positive `amount`), reversing one
 * increases it (negative `amount`). A balance seeded below `originalAmount` (a
 * paydown made before in-app tracking began) is preserved rather than recomputed
 * away.
 *
 * The update is a single atomic, *relative* SQL decrement for two reasons:
 *  1. Concurrency — two repayments (or a double-click / client retry) can't read
 *     the same balance and clobber each other's write.
 *  2. Reversibility — the value is NOT clamped at write time. Clamping here would
 *     discard the overshoot of an over-large repayment, so a later reversal (edit
 *     down / unlink / delete) would restore the wrong balance. The stored value
 *     may therefore dip below 0 or exceed originalAmount; `computeLoanProgress`
 *     clamps to [0, originalAmount] on every read, so all displays stay correct.
 */
export async function applyRepaymentToBalance(loanId: string, amount: number) {
  if (!amount) return;
  const db = await getDb();
  await db
    .update(loans)
    .set({ currentBalance: sql`${loans.currentBalance} - ${amount}` })
    .where(eq(loans.id, loanId));
}

async function getRepaymentBySourceExpense(
  expenseId: string
): Promise<LoanRepayment | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(loanRepayments)
    .where(eq(loanRepayments.sourceExpenseId, expenseId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Reconcile the auto-generated loan repayment for a single expense.
 *
 * Idempotent: derives the *desired* repayment (a paid "Loan"-category expense
 * with a linked loan should have exactly one repayment for its current amount)
 * and the *existing* one keyed by `sourceExpenseId`, then applies only the diff
 * to the loan balance. Safe to call after any expense create/update/markAsPaid/
 * delete — including after the expense row is gone (desired = none).
 */
export async function reconcileExpenseRepayment(expenseId: string) {
  const expense = await getExpenseById(expenseId);
  const existing = await getRepaymentBySourceExpense(expenseId);

  const desiredLoanId =
    expense && expense.category === "Loan" && expense.loanId && expense.isPaid
      ? expense.loanId
      : null;
  const desiredAmount = desiredLoanId ? expense!.amount : 0;
  const desiredDate = expense?.paidDate ?? expense?.date ?? "";
  const desiredNotes = expense ? `Expense: ${expense.name}` : null;

  // Existing repayment points at a different loan (loan changed / unlinked /
  // unpaid / deleted): undo it on the old loan and drop the row.
  if (existing && existing.loanId !== desiredLoanId) {
    await applyRepaymentToBalance(existing.loanId, -existing.amount);
    await deleteLoanRepayment(existing.id, existing.loanId);
  }

  if (!desiredLoanId) return;

  if (existing && existing.loanId === desiredLoanId) {
    // Same loan: apply only the amount delta, then sync row fields.
    const delta = desiredAmount - existing.amount;
    if (delta !== 0) await applyRepaymentToBalance(desiredLoanId, delta);
    const db = await getDb();
    await db
      .update(loanRepayments)
      .set({ amount: desiredAmount, date: desiredDate, notes: desiredNotes })
      .where(eq(loanRepayments.id, existing.id));
    return;
  }

  // No matching repayment yet: create one and decrement the balance.
  await applyRepaymentToBalance(desiredLoanId, desiredAmount);
  await createLoanRepayment({
    id: nanoid(),
    loanId: desiredLoanId,
    amount: desiredAmount,
    date: desiredDate,
    notes: desiredNotes,
    sourceExpenseId: expenseId,
  });
}
