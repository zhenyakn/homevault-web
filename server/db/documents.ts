import { and, eq } from "drizzle-orm";
import {
  expenses,
  repairs,
  upgrades,
  loans,
  wishlistItems,
  purchaseCosts,
} from "../../drizzle/schema";
import { getDb, parseJsonArray } from "./client";

// "Home file" / Home Documents are not a dedicated table — they are the
// attachments scattered across the app's entity tables. This module aggregates
// those attachments into the homeowner-facing document categories and derives a
// real completeness figure (how many categories have at least one document).

export type DocCategoryKey =
  | "mortgage"
  | "insurance"
  | "taxes"
  | "utilities"
  | "warranties"
  | "receipts"
  | "contractors"
  | "ownership"
  | "renovations";

export const DOC_CATEGORY_KEYS: DocCategoryKey[] = [
  "mortgage",
  "insurance",
  "taxes",
  "utilities",
  "warranties",
  "receipts",
  "contractors",
  "ownership",
  "renovations",
];

export interface DocCategorySummary {
  key: DocCategoryKey;
  count: number;
  lastUpdated: string | null;
}

export interface DocumentsSummary {
  categories: DocCategorySummary[];
  totalFiles: number;
  completedCount: number;
  totalCategories: number;
  percentage: number;
  missing: DocCategoryKey[];
}

// Expense categories → document buckets.
function expenseBucket(cat: string | null): DocCategoryKey {
  switch (cat) {
    case "Insurance":
      return "insurance";
    case "Tax":
      return "taxes";
    case "Utilities":
      return "utilities";
    case "Renovation":
      return "renovations";
    default:
      // Maintenance, Management, Loan, Other
      return "receipts";
  }
}

// Acquisition-cost categories → document buckets.
function purchaseBucket(cat: string | null): DocCategoryKey {
  switch (cat) {
    case "Tax":
      return "taxes";
    case "Legal":
    case "Agency":
    case "Inspection":
      return "ownership";
    case "Renovation":
      return "renovations";
    default:
      // Moving, Other
      return "receipts";
  }
}

export async function getDocumentsSummary(
  userId: number,
  propertyId: number
): Promise<DocumentsSummary> {
  const db = await getDb();

  const counts = Object.fromEntries(
    DOC_CATEGORY_KEYS.map(k => [k, 0])
  ) as Record<DocCategoryKey, number>;
  const last = Object.fromEntries(
    DOC_CATEGORY_KEYS.map(k => [k, null])
  ) as Record<DocCategoryKey, string | null>;

  const add = (
    key: DocCategoryKey,
    n: number,
    updatedAt: Date | string | null
  ) => {
    if (n <= 0) return;
    counts[key] += n;
    const iso = updatedAt ? new Date(updatedAt).toISOString() : null;
    if (iso && (!last[key] || iso > (last[key] as string))) last[key] = iso;
  };
  const nAtt = (a: unknown) => parseJsonArray(a).length;

  const ownedExpenses = and(
    eq(expenses.ownerId, userId),
    eq(expenses.propertyId, propertyId)
  );

  const [exp, rep, upg, lns, wish, pur] = await Promise.all([
    db
      .select({
        a: expenses.attachments,
        c: expenses.category,
        u: expenses.updatedAt,
      })
      .from(expenses)
      .where(ownedExpenses),
    db
      .select({ a: repairs.attachments, u: repairs.updatedAt })
      .from(repairs)
      .where(
        and(eq(repairs.ownerId, userId), eq(repairs.propertyId, propertyId))
      ),
    db
      .select({ a: upgrades.attachments, u: upgrades.updatedAt })
      .from(upgrades)
      .where(
        and(eq(upgrades.ownerId, userId), eq(upgrades.propertyId, propertyId))
      ),
    db
      .select({ a: loans.attachments, u: loans.updatedAt })
      .from(loans)
      .where(and(eq(loans.ownerId, userId), eq(loans.propertyId, propertyId))),
    db
      .select({ a: wishlistItems.attachments, u: wishlistItems.updatedAt })
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, userId),
          eq(wishlistItems.propertyId, propertyId)
        )
      ),
    db
      .select({
        a: purchaseCosts.attachments,
        c: purchaseCosts.category,
        u: purchaseCosts.updatedAt,
      })
      .from(purchaseCosts)
      .where(
        and(
          eq(purchaseCosts.ownerId, userId),
          eq(purchaseCosts.propertyId, propertyId)
        )
      ),
  ]);

  for (const r of exp) add(expenseBucket(r.c), nAtt(r.a), r.u);
  for (const r of rep) add("contractors", nAtt(r.a), r.u);
  for (const r of upg) add("renovations", nAtt(r.a), r.u);
  for (const r of lns) add("mortgage", nAtt(r.a), r.u);
  // Warranties live with the things they cover — appliances/purchases tracked
  // on the wishlist. Best available source until a dedicated table exists.
  for (const r of wish) add("warranties", nAtt(r.a), r.u);
  for (const r of pur) add(purchaseBucket(r.c), nAtt(r.a), r.u);

  const categories: DocCategorySummary[] = DOC_CATEGORY_KEYS.map(key => ({
    key,
    count: counts[key],
    lastUpdated: last[key],
  }));
  const totalFiles = categories.reduce((s, c) => s + c.count, 0);
  const completedCount = categories.filter(c => c.count > 0).length;
  const totalCategories = DOC_CATEGORY_KEYS.length;
  const percentage = Math.round((completedCount / totalCategories) * 100);
  const missing = categories.filter(c => c.count === 0).map(c => c.key);

  return {
    categories,
    totalFiles,
    completedCount,
    totalCategories,
    percentage,
    missing,
  };
}
