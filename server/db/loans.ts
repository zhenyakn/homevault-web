import { eq, desc, and, inArray } from "drizzle-orm";
import {
  loans,
  loanRepayments,
  type Loan,
  type LoanRepayment,
} from "../../drizzle/schema";
import { getDb } from "./client";

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
  userId: number,
  propertyId: number,
  limit = 500,
  offset = 0
): Promise<LoanWithRepayments[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(loans)
    .where(and(eq(loans.ownerId, userId), eq(loans.propertyId, propertyId)))
    .orderBy(desc(loans.createdAt))
    .limit(limit)
    .offset(offset);
  return attachRepayments(rows);
}

export async function getLoanById(
  id: string
): Promise<LoanWithRepayments | null> {
  const db = await getDb();
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
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
  ownerId: number,
  data: Partial<Loan>
) {
  const db = await getDb();
  const normalized: any = { ...data };
  if ("attachments" in normalized)
    normalized.attachments = normalized.attachments ?? [];
  await db
    .update(loans)
    .set(normalized)
    .where(and(eq(loans.id, id), eq(loans.ownerId, ownerId)));
  return data;
}

export async function deleteLoan(id: string, ownerId: number) {
  const db = await getDb();
  await db
    .delete(loans)
    .where(and(eq(loans.id, id), eq(loans.ownerId, ownerId)));
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
