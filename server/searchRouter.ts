import { z } from "zod";
import { like, and, eq, or } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  expenses,
  repairs,
  upgrades,
  loans,
  wishlistItems,
  purchaseCosts,
} from "../drizzle/schema";

export const searchRouter = router({
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        propertyId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, propertyId } = input;
      const userId = ctx.user.id;
      const db = await getDb();
      const pattern = `%${query}%`;

      const scopeFilter = (table: { ownerId: any; propertyId: any }) =>
        and(eq(table.ownerId, userId), eq(table.propertyId, propertyId));

      const [
        expenseRows,
        repairRows,
        upgradeRows,
        loanRows,
        wishlistRows,
        purchaseCostRows,
      ] = await Promise.all([
        db
          .select({
            id: expenses.id,
            label: expenses.label,
            category: expenses.category,
            amount: expenses.amount,
            date: expenses.date,
          })
          .from(expenses)
          .where(and(scopeFilter(expenses), like(expenses.label, pattern)))
          .limit(5),

        db
          .select({
            id: repairs.id,
            label: repairs.label,
            status: repairs.status,
            priority: repairs.priority,
          })
          .from(repairs)
          .where(
            and(
              scopeFilter(repairs),
              or(
                like(repairs.label, pattern),
                like(repairs.description, pattern)
              )
            )
          )
          .limit(5),

        db
          .select({
            id: upgrades.id,
            label: upgrades.label,
            status: upgrades.status,
          })
          .from(upgrades)
          .where(and(scopeFilter(upgrades), like(upgrades.label, pattern)))
          .limit(5),

        db
          .select({
            id: loans.id,
            label: loans.lender,
            loanType: loans.loanType,
            totalAmount: loans.totalAmount,
          })
          .from(loans)
          .where(and(scopeFilter(loans), like(loans.lender, pattern)))
          .limit(5),

        db
          .select({
            id: wishlistItems.id,
            label: wishlistItems.label,
            priority: wishlistItems.priority,
            estimatedCost: wishlistItems.estimatedCost,
          })
          .from(wishlistItems)
          .where(
            and(scopeFilter(wishlistItems), like(wishlistItems.label, pattern))
          )
          .limit(5),

        db
          .select({
            id: purchaseCosts.id,
            label: purchaseCosts.label,
            amount: purchaseCosts.amount,
            date: purchaseCosts.date,
          })
          .from(purchaseCosts)
          .where(
            and(scopeFilter(purchaseCosts), like(purchaseCosts.label, pattern))
          )
          .limit(5),
      ]);

      return {
        expenses: expenseRows.map((r) => ({ ...r, type: "expense" as const })),
        repairs: repairRows.map((r) => ({ ...r, type: "repair" as const })),
        upgrades: upgradeRows.map((r) => ({ ...r, type: "upgrade" as const })),
        loans: loanRows.map((r) => ({ ...r, type: "loan" as const })),
        wishlist: wishlistRows.map((r) => ({ ...r, type: "wishlist" as const })),
        purchaseCosts: purchaseCostRows.map((r) => ({
          ...r,
          type: "purchaseCost" as const,
        })),
        total:
          expenseRows.length +
          repairRows.length +
          upgradeRows.length +
          loanRows.length +
          wishlistRows.length +
          purchaseCostRows.length,
      };
    }),
});
