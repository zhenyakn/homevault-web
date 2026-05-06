import { eq, desc, and, inArray } from "drizzle-orm";
import {
  expenses, repairs, upgrades, upgradeOptions, loans, purchaseCosts,
  type Expense, type Repair, type Loan,
  users,
} from "../../drizzle/schema";
import { getDb, parseJsonArray } from "./client";
import { getProperty, getPropertiesByUser } from "./properties";

export function calcMonthlyStats(allExpenses: Expense[], monthStart: string, monthEnd: string) {
  const thisMonthExp = allExpenses.filter(e => e.date >= monthStart && e.date <= monthEnd);
  const monthSpent = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const monthlyRecurring = allExpenses
    .filter(e => e.isRecurring && e.recurringInterval === "monthly")
    .reduce((s, e) => s + e.amount, 0);
  const monthCats: Record<string, number> = {};
  for (const e of thisMonthExp) monthCats[e.category] = (monthCats[e.category] || 0) + e.amount;
  return { monthSpent, monthlyRecurring, monthCats };
}

export function getOverdueExpenses(allExpenses: Expense[], today: string) {
  return allExpenses
    .filter(e => e.isRecurring && !e.isPaid && e.date <= today)
    .map(e => ({ id: e.id, label: e.name, amount: e.amount, date: e.date }));
}

function getStaleRepairs(allRepairs: Repair[], staleCutoff: string) {
  return allRepairs
    .filter(r => r.status !== "completed" && r.status !== "cancelled" &&
      (r.priority === "urgent" || r.priority === "high") &&
      (r.updatedAt
        ? new Date(r.updatedAt).toISOString().split("T")[0] <= staleCutoff
        : (r.reportedDate ?? "") <= staleCutoff))
    .map(r => ({ id: r.id, label: r.title, priority: r.priority, status: r.status, contractor: r.contractor }));
}

export function buildLoanSummary(allLoans: (Loan & { repayments: any[] })[]) {
  return allLoans.map(l => {
    const repaid = l.repayments.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
    const remaining = Math.max(0, l.originalAmount - repaid);
    return {
      id: l.id, lender: l.lender, loanType: l.loanType,
      totalAmount: l.originalAmount, repaid, remaining,
      pct: l.originalAmount > 0 ? Math.round((repaid / l.originalAmount) * 100) : 0,
      paidOff: repaid >= l.originalAmount,
      interestRate: l.interestRate,
      endDate: l.endDate,
    };
  });
}

export async function getRecentActivity(propertyId: number) {
  const db = await getDb();

  const [recentExpenses, recentRepairs, recentUpgrades] = await Promise.all([
    db
      .select({ id: expenses.id, label: expenses.name, ownerId: expenses.ownerId, createdAt: expenses.createdAt, ownerName: users.name })
      .from(expenses)
      .leftJoin(users, eq(expenses.ownerId, users.id))
      .where(eq(expenses.propertyId, propertyId))
      .orderBy(desc(expenses.createdAt))
      .limit(5),
    db
      .select({ id: repairs.id, label: repairs.title, ownerId: repairs.ownerId, createdAt: repairs.createdAt, ownerName: users.name })
      .from(repairs)
      .leftJoin(users, eq(repairs.ownerId, users.id))
      .where(eq(repairs.propertyId, propertyId))
      .orderBy(desc(repairs.createdAt))
      .limit(5),
    db
      .select({ id: upgrades.id, label: upgrades.title, ownerId: upgrades.ownerId, createdAt: upgrades.createdAt, ownerName: users.name })
      .from(upgrades)
      .leftJoin(users, eq(upgrades.ownerId, users.id))
      .where(eq(upgrades.propertyId, propertyId))
      .orderBy(desc(upgrades.createdAt))
      .limit(5),
  ]);

  const all = [
    ...recentExpenses.map((e) => ({ ...e, type: "expense" as const })),
    ...recentRepairs.map((r) => ({ ...r, type: "repair" as const })),
    ...recentUpgrades.map((u) => ({ ...u, type: "upgrade" as const })),
  ];

  all.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  return all.slice(0, 10);
}

export async function getDashboardStats(userId: number, propertyId: number) {
  const db = await getDb();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();
  const monthStart   = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const monthEnd     = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];
  const today        = now.toISOString().split("T")[0];
  const staleCutoff  = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const ownerPropFilter = <T extends { ownerId: ReturnType<typeof eq>; propertyId: ReturnType<typeof eq> }>(
    col: { ownerId: any; propertyId: any }
  ) => and(eq(col.ownerId, userId), eq(col.propertyId, propertyId));

  const [
    allExpenses, allRepairs, allUpgrades, allLoansRaw, allPurchaseCosts, prop,
  ] = await Promise.all([
    db.select().from(expenses).where(ownerPropFilter(expenses)),
    db.select().from(repairs).where(ownerPropFilter(repairs)),
    db.select().from(upgrades).where(ownerPropFilter(upgrades)),
    db.select().from(loans).where(ownerPropFilter(loans)),
    db.select().from(purchaseCosts).where(ownerPropFilter(purchaseCosts)),
    getProperty(propertyId),
  ]);

  const allLoans = allLoansRaw.map(l => ({ ...l, repayments: parseJsonArray(l.repayments) }));

  const { monthSpent, monthlyRecurring, monthCats } = calcMonthlyStats(allExpenses, monthStart, monthEnd);
  const overdueExpenses = getOverdueExpenses(allExpenses, today);
  const staleRepairs    = getStaleRepairs(allRepairs, staleCutoff);

  const priOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const openRepairs = allRepairs
    .filter(r => r.status !== "completed" && r.status !== "cancelled")
    .sort((a, b) => (priOrder[a.priority ?? "low"] ?? 3) - (priOrder[b.priority ?? "low"] ?? 3))
    .slice(0, 5)
    .map(r => ({ id: r.id, label: r.title, priority: r.priority, status: r.status, contractor: r.contractor }));

  const activeIds = allUpgrades.filter(u => u.status === "in_progress").map(u => u.id);
  const activeOpts = activeIds.length > 0
    ? await db.select({ upgradeId: upgradeOptions.upgradeId, selected: upgradeOptions.selected })
        .from(upgradeOptions).where(inArray(upgradeOptions.upgradeId, activeIds))
    : [];

  const selMap: Record<string, boolean> = {};
  const hasOptsSet = new Set<string>();
  for (const o of activeOpts) {
    hasOptsSet.add(o.upgradeId);
    if (o.selected) selMap[o.upgradeId] = true;
  }

  const upgradesNeedingDecision = allUpgrades
    .filter(u => u.status === "in_progress" && hasOptsSet.has(u.id) && !selMap[u.id])
    .map(u => ({ id: u.id, label: u.title }));

  const activeUpgrades = allUpgrades
    .filter(u => u.status === "in_progress")
    .map(u => ({
      id: u.id, label: u.title, budget: u.estimatedCost ?? 0, spent: u.actualCost ?? 0,
      status: u.status,
      pct: (u.estimatedCost ?? 0) > 0 ? Math.round(((u.actualCost ?? 0) / u.estimatedCost!) * 100) : 0,
    }));

  const loanSummary = buildLoanSummary(allLoans);

  return {
    monthSpent, monthlyRecurring,
    monthPct:       monthlyRecurring > 0 ? Math.round((monthSpent / monthlyRecurring) * 100) : 0,
    monthRemaining: Math.max(0, monthlyRecurring - monthSpent),
    monthCats,
    overdueExpenses, staleRepairs, upgradesNeedingDecision,
    openRepairs,
    openRepairsCount: allRepairs.filter(r => r.status !== "completed" && r.status !== "cancelled").length,
    activeUpgrades,
    loanSummary,
    currency:        prop?.currencyCode || "ILS",
    propertyName:    prop?.houseName || "My Home",
    propertyAddress: prop?.address,
  };
}

export async function getPortfolioSummary(userId: number) {
  const props = await getPropertiesByUser(userId);
  if (props.length === 0) return [];

  const db = await getDb();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  return await Promise.all(props.map(async (prop) => {
    const pid = prop.id;
    const propFilter = <T extends { ownerId: any; propertyId: any }>(col: T) =>
      and(eq(col.ownerId, userId), eq(col.propertyId, pid));

    const [allExpenses, allRepairs, allLoans] = await Promise.all([
      db.select({ amount: expenses.amount, date: expenses.date }).from(expenses).where(propFilter(expenses)),
      db.select({ status: repairs.status }).from(repairs).where(propFilter(repairs)),
      db.select({ originalAmount: loans.originalAmount, repayments: loans.repayments }).from(loans).where(propFilter(loans)),
    ]);

    const monthSpent = allExpenses
      .filter(e => e.date >= monthStart && e.date <= monthEnd)
      .reduce((s, e) => s + e.amount, 0);

    const openRepairsCount = allRepairs.filter(r => r.status !== "completed" && r.status !== "cancelled").length;

    const outstandingLoanBalance = allLoans.reduce((sum, l) => {
      const repaid = parseJsonArray(l.repayments).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
      return sum + Math.max(0, l.originalAmount - repaid);
    }, 0);

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
  }));
}
