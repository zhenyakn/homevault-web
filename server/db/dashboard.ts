import { eq, desc, and, inArray, gte, lte, notInArray, sql } from "drizzle-orm";
import {
  expenses,
  repairs,
  upgrades,
  upgradeOptions,
  loans,
  type Expense,
  type Repair,
  users,
} from "../../drizzle/schema";
import { getDb } from "./client";
import { getProperty, getPropertiesByUser } from "./properties";
import { computeLoanProgress } from "../../shared/loanProgress";

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export function calcMonthlyStats(
  allExpenses: Expense[],
  monthStart: string,
  monthEnd: string
) {
  const thisMonthExp = allExpenses.filter(
    e => e.date >= monthStart && e.date <= monthEnd
  );
  const monthSpent = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const monthlyRecurring = allExpenses
    .filter(e => e.isRecurring && e.recurringInterval === "monthly")
    .reduce((s, e) => s + e.amount, 0);
  const monthCats: Record<string, number> = {};
  for (const e of thisMonthExp) {
    const cat = e.category ?? "Other";
    monthCats[cat] = (monthCats[cat] || 0) + e.amount;
  }
  return { monthSpent, monthlyRecurring, monthCats };
}

export function getOverdueExpenses(allExpenses: Expense[], today: string) {
  return allExpenses
    .filter(e => e.isRecurring && !e.isPaid && e.date <= today)
    .map(e => ({ id: e.id, label: e.name, amount: e.amount, date: e.date }));
}

// ── Recent activity feed ──────────────────────────────────────────────────────

export async function getRecentActivity(propertyId: number) {
  const db = await getDb();

  const [recentExpenses, recentRepairs, recentUpgrades] = await Promise.all([
    db
      .select({
        id: expenses.id,
        label: expenses.name,
        ownerId: expenses.ownerId,
        createdAt: expenses.createdAt,
        ownerName: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.ownerId, users.id))
      .where(eq(expenses.propertyId, propertyId))
      .orderBy(desc(expenses.createdAt))
      .limit(5),
    db
      .select({
        id: repairs.id,
        label: repairs.title,
        ownerId: repairs.ownerId,
        createdAt: repairs.createdAt,
        ownerName: users.name,
      })
      .from(repairs)
      .leftJoin(users, eq(repairs.ownerId, users.id))
      .where(eq(repairs.propertyId, propertyId))
      .orderBy(desc(repairs.createdAt))
      .limit(5),
    db
      .select({
        id: upgrades.id,
        label: upgrades.title,
        ownerId: upgrades.ownerId,
        createdAt: upgrades.createdAt,
        ownerName: users.name,
      })
      .from(upgrades)
      .leftJoin(users, eq(upgrades.ownerId, users.id))
      .where(eq(upgrades.propertyId, propertyId))
      .orderBy(desc(upgrades.createdAt))
      .limit(5),
  ]);

  const all = [
    ...recentExpenses.map(e => ({ ...e, type: "expense" as const })),
    ...recentRepairs.map(r => ({ ...r, type: "repair" as const })),
    ...recentUpgrades.map(u => ({ ...u, type: "upgrade" as const })),
  ];

  all.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  return all.slice(0, 10);
}

// ── Dashboard stats — targeted SQL queries, no full-table loads ───────────────

/**
 * Lightweight "needs attention" feed for the notification bell: just overdue
 * recurring bills + stale high/urgent repairs. This is a tiny subset of
 * getDashboardStats so the header can poll it cheaply on every route without
 * dragging the full dashboard aggregate (expenses/loans/upgrades/portfolio).
 */
export async function getAttentionItems(userId: number, propertyId: number) {
  const db = await getDb();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const staleCutoffDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const [overdueExpenses, staleRepairs] = await Promise.all([
    db
      .select({
        id: expenses.id,
        label: expenses.name,
        amount: expenses.amount,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.ownerId, userId),
          eq(expenses.propertyId, propertyId),
          eq(expenses.isRecurring, true),
          eq(expenses.isPaid, false),
          lte(expenses.date, today)
        )
      ),
    db
      .select({ id: repairs.id, label: repairs.title })
      .from(repairs)
      .where(
        and(
          eq(repairs.ownerId, userId),
          eq(repairs.propertyId, propertyId),
          notInArray(repairs.status, ["completed", "cancelled"]),
          inArray(repairs.priority, ["urgent", "high"]),
          lte(repairs.updatedAt, staleCutoffDate)
        )
      ),
  ]);

  return { overdueExpenses, staleRepairs };
}

export async function getDashboardStats(userId: number, propertyId: number) {
  const db = await getDb();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(currentYear, currentMonth + 1, 0)
    .toISOString()
    .split("T")[0];
  const today = now.toISOString().split("T")[0];
  // 5-day lookback as a Date for timestamp comparison
  const staleCutoffDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const expFilter = and(
    eq(expenses.ownerId, userId),
    eq(expenses.propertyId, propertyId)
  );
  const repFilter = and(
    eq(repairs.ownerId, userId),
    eq(repairs.propertyId, propertyId)
  );
  const upgFilter = and(
    eq(upgrades.ownerId, userId),
    eq(upgrades.propertyId, propertyId)
  );
  const loanFilter = and(
    eq(loans.ownerId, userId),
    eq(loans.propertyId, propertyId)
  );

  const [
    monthSpentRows,
    monthlyRecurringRows,
    monthCatsRows,
    overdueExpenses,
    openRepairsCountRows,
    openRepairs,
    staleRepairs,
    activeUpgradeRows,
    loanRows,
    prop,
  ] = await Promise.all([
    // Monthly spend (SQL SUM — no full table load)
    db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          expFilter,
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      ),

    // Monthly recurring baseline (SQL SUM)
    db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          expFilter,
          eq(expenses.isRecurring, true),
          eq(expenses.recurringInterval, "monthly")
        )
      ),

    // Category breakdown this month (SQL GROUP BY)
    db
      .select({
        category: expenses.category,
        total: sql<number>`SUM(${expenses.amount})`,
      })
      .from(expenses)
      .where(
        and(
          expFilter,
          gte(expenses.date, monthStart),
          lte(expenses.date, monthEnd)
        )
      )
      .groupBy(expenses.category),

    // Overdue recurring unpaid — exact rows for UI
    db
      .select({
        id: expenses.id,
        label: expenses.name,
        amount: expenses.amount,
        date: expenses.date,
        recurringInterval: expenses.recurringInterval,
      })
      .from(expenses)
      .where(
        and(
          expFilter,
          eq(expenses.isRecurring, true),
          eq(expenses.isPaid, false),
          lte(expenses.date, today)
        )
      ),

    // Open repairs count (SQL COUNT — no full table load)
    db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(repairs)
      .where(
        and(repFilter, notInArray(repairs.status, ["completed", "cancelled"]))
      ),

    // Top 5 open repairs ordered by priority
    db
      .select({
        id: repairs.id,
        label: repairs.title,
        priority: repairs.priority,
        status: repairs.status,
        contractor: repairs.contractor,
      })
      .from(repairs)
      .where(
        and(repFilter, notInArray(repairs.status, ["completed", "cancelled"]))
      )
      .orderBy(
        sql`CASE ${repairs.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
      )
      .limit(5),

    // Stale high/urgent repairs not updated in 5+ days
    db
      .select({
        id: repairs.id,
        label: repairs.title,
        priority: repairs.priority,
        status: repairs.status,
        contractor: repairs.contractor,
      })
      .from(repairs)
      .where(
        and(
          repFilter,
          notInArray(repairs.status, ["completed", "cancelled"]),
          inArray(repairs.priority, ["urgent", "high"]),
          lte(repairs.updatedAt, staleCutoffDate)
        )
      ),

    // Active upgrades (in_progress) — only needed columns
    db
      .select({
        id: upgrades.id,
        label: upgrades.title,
        estimatedCost: upgrades.estimatedCost,
        actualCost: upgrades.actualCost,
        status: upgrades.status,
      })
      .from(upgrades)
      .where(and(upgFilter, eq(upgrades.status, "in_progress"))),

    // Loans — currentBalance is kept in sync by addRepayment
    db
      .select({
        id: loans.id,
        lender: loans.lender,
        loanType: loans.loanType,
        originalAmount: loans.originalAmount,
        currentBalance: loans.currentBalance,
        interestRate: loans.interestRate,
        endDate: loans.endDate,
      })
      .from(loans)
      .where(loanFilter),

    getProperty(propertyId),
  ]);

  // Aggregate scalars
  const monthSpent = Number(monthSpentRows[0]?.total ?? 0);
  const monthlyRecurring = Number(monthlyRecurringRows[0]?.total ?? 0);
  const monthCats: Record<string, number> = {};
  for (const row of monthCatsRows) {
    if (row.category) monthCats[row.category] = Number(row.total ?? 0);
  }
  const openRepairsCount = Number(openRepairsCountRows[0]?.cnt ?? 0);

  // Loan summary — derive progress from the shared helper so the Dashboard and
  // the Loans page can never disagree (currentBalance is kept in sync by
  // addRepayment).
  const loanSummary = loanRows.map(l => ({
    id: l.id,
    lender: l.lender,
    loanType: l.loanType,
    totalAmount: l.originalAmount,
    ...computeLoanProgress(l.originalAmount, l.currentBalance),
    interestRate: l.interestRate,
    endDate: l.endDate,
  }));

  // Upgrades needing a decision: in_progress + has options + no selected option
  // We already have the activeUpgrade IDs from the parallel query above — just
  // fetch option status for those specific IDs (bounded, never a full table scan)
  const activeUpgradeIds = activeUpgradeRows.map(u => u.id);
  const optionStatusRows =
    activeUpgradeIds.length > 0
      ? await db
          .select({
            upgradeId: upgradeOptions.upgradeId,
            selected: upgradeOptions.selected,
          })
          .from(upgradeOptions)
          .where(inArray(upgradeOptions.upgradeId, activeUpgradeIds))
      : [];

  const selMap: Record<string, boolean> = {};
  const hasOptsSet = new Set<string>();
  for (const o of optionStatusRows) {
    hasOptsSet.add(o.upgradeId);
    if (o.selected) selMap[o.upgradeId] = true;
  }

  const upgradesNeedingDecision = activeUpgradeRows
    .filter(u => hasOptsSet.has(u.id) && !selMap[u.id])
    .map(u => ({ id: u.id, label: u.label }));

  const activeUpgrades = activeUpgradeRows.map(u => ({
    id: u.id,
    label: u.label,
    budget: u.estimatedCost ?? 0,
    spent: u.actualCost ?? 0,
    status: u.status,
    pct:
      (u.estimatedCost ?? 0) > 0
        ? Math.round(((u.actualCost ?? 0) / u.estimatedCost!) * 100)
        : 0,
  }));

  return {
    monthSpent,
    monthlyRecurring,
    monthPct:
      monthlyRecurring > 0
        ? Math.round((monthSpent / monthlyRecurring) * 100)
        : 0,
    monthRemaining: Math.max(0, monthlyRecurring - monthSpent),
    monthCats,
    overdueExpenses,
    staleRepairs,
    upgradesNeedingDecision,
    openRepairs,
    openRepairsCount,
    activeUpgrades,
    loanSummary,
    currency: prop?.currencyCode || "ILS",
    propertyName: prop?.houseName || "My Home",
    propertyAddress: prop?.address,
  };
}

// ── Portfolio summary ─────────────────────────────────────────────────────────

export async function getPortfolioSummary(userId: number) {
  const props = await getPropertiesByUser(userId);
  if (props.length === 0) return [];

  const db = await getDb();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  return await Promise.all(
    props.map(async prop => {
      const pid = prop.id;
      const expF = and(
        eq(expenses.ownerId, userId),
        eq(expenses.propertyId, pid)
      );
      const repF = and(
        eq(repairs.ownerId, userId),
        eq(repairs.propertyId, pid)
      );
      const loanF = and(eq(loans.ownerId, userId), eq(loans.propertyId, pid));

      const [monthSpentRows, openRepairsCountRows, loanRows] =
        await Promise.all([
          db
            .select({
              total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
            })
            .from(expenses)
            .where(
              and(
                expF,
                gte(expenses.date, monthStart),
                lte(expenses.date, monthEnd)
              )
            ),

          db
            .select({ cnt: sql<number>`COUNT(*)` })
            .from(repairs)
            .where(
              and(repF, notInArray(repairs.status, ["completed", "cancelled"]))
            ),

          // currentBalance is kept in sync by loans.addRepayment — use it directly
          db
            .select({
              originalAmount: loans.originalAmount,
              currentBalance: loans.currentBalance,
            })
            .from(loans)
            .where(loanF),
        ]);

      const monthSpent = Number(monthSpentRows[0]?.total ?? 0);
      const openRepairsCount = Number(openRepairsCountRows[0]?.cnt ?? 0);
      const outstandingLoanBalance = loanRows.reduce(
        (sum, l) =>
          sum +
          computeLoanProgress(l.originalAmount, l.currentBalance).remaining,
        0
      );

      return {
        id: prop.id,
        houseName: prop.houseName,
        houseNickname: prop.houseNickname,
        address: prop.address,
        propertyType: prop.propertyType,
        purchasePrice: prop.purchasePrice,
        currencyCode: prop.currencyCode || "ILS",
        monthSpent,
        openRepairsCount,
        outstandingLoanBalance,
      };
    })
  );
}
