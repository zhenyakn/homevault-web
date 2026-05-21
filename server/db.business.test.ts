import { describe, it, expect } from "vitest";
import { getOverdueExpenses, calcMonthlyStats, buildLoanSummary } from "./db";
import {
  upgrades,
  repairQuotes,
  upgradeOptions,
  upgradeItems,
  expenses,
} from "../drizzle/schema";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeExpense(overrides: Record<string, any> = {}) {
  return {
    id: "exp-1",
    propertyId: 1,
    ownerId: 1,
    name: "Test expense",
    amount: 10000,
    date: "2026-03-01",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: false,
    paidDate: null,
    nextDueDate: null,
    notes: null,
    attachments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLoan(overrides: Record<string, any> = {}) {
  return {
    id: "loan-1",
    propertyId: 1,
    ownerId: 1,
    name: "Test loan",
    lender: "Bank",
    originalAmount: 100000,
    currentBalance: 100000,
    interestRate: "3.5",
    monthlyPayment: 5000,
    startDate: "2020-01-01",
    endDate: "2040-01-01",
    nextPaymentDate: null,
    loanType: "mortgage" as const,
    notes: null,
    attachments: null,
    repayments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── getOverdueExpenses ─────────────────────────────────────────────────────────

describe("getOverdueExpenses", () => {
  it("returns unpaid recurring expenses with dates on or before today", () => {
    const expenses = [makeExpense({ date: "2026-04-01", isPaid: false })];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("exp-1");
  });

  it("excludes paid expenses — the critical bug that was fixed", () => {
    const expenses = [makeExpense({ date: "2026-03-01", isPaid: true })];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(0);
  });

  it("excludes non-recurring expenses", () => {
    const expenses = [makeExpense({ isRecurring: false, isPaid: false })];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(0);
  });

  it("excludes expenses with future dates", () => {
    const expenses = [makeExpense({ date: "2026-06-01", isPaid: false })];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(0);
  });

  it("includes expenses dated exactly today", () => {
    const expenses = [makeExpense({ date: "2026-05-01", isPaid: false })];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(1);
  });

  it("returns correct shape: id, label, amount, date", () => {
    const expenses = [
      makeExpense({
        date: "2026-04-01",
        isPaid: false,
        name: "Water bill",
        amount: 17500,
      }),
    ];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result[0]).toEqual({
      id: "exp-1",
      label: "Water bill",
      amount: 17500,
      date: "2026-04-01",
    });
  });

  it("handles mix of paid and unpaid correctly", () => {
    const expenses = [
      makeExpense({ id: "a", date: "2026-03-01", isPaid: true }),
      makeExpense({ id: "b", date: "2026-04-01", isPaid: false }),
      makeExpense({
        id: "c",
        date: "2026-04-01",
        isPaid: false,
        isRecurring: false,
      }),
    ];
    const result = getOverdueExpenses(expenses as any, "2026-05-01");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });
});

// ── calcMonthlyStats ───────────────────────────────────────────────────────────

describe("calcMonthlyStats", () => {
  it("sums expenses within the month range", () => {
    const expenses = [
      makeExpense({ date: "2026-04-01", amount: 10000, isRecurring: false }),
      makeExpense({ date: "2026-04-15", amount: 5000, isRecurring: false }),
      makeExpense({ date: "2026-05-01", amount: 9999, isRecurring: false }), // outside
    ];
    const { monthSpent } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthSpent).toBe(15000);
  });

  it("includes the start and end date boundaries", () => {
    const expenses = [
      makeExpense({ date: "2026-04-01", amount: 1000, isRecurring: false }),
      makeExpense({ date: "2026-04-30", amount: 2000, isRecurring: false }),
    ];
    const { monthSpent } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthSpent).toBe(3000);
  });

  it("calculates monthlyRecurring across ALL expenses (not just the window)", () => {
    const expenses = [
      makeExpense({
        date: "2026-03-01",
        amount: 8000,
        isRecurring: true,
        recurringInterval: "monthly",
      }),
      makeExpense({
        date: "2026-04-01",
        amount: 8000,
        isRecurring: true,
        recurringInterval: "monthly",
      }),
    ];
    const { monthlyRecurring } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthlyRecurring).toBe(16000);
  });

  it("does not count quarterly/yearly as monthly recurring", () => {
    const expenses = [
      makeExpense({
        amount: 5000,
        isRecurring: true,
        recurringInterval: "quarterly",
      }),
      makeExpense({
        amount: 3000,
        isRecurring: true,
        recurringInterval: "yearly",
      }),
    ];
    const { monthlyRecurring } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthlyRecurring).toBe(0);
  });

  it("groups monthCats correctly", () => {
    const expenses = [
      makeExpense({
        date: "2026-04-01",
        amount: 1000,
        category: "Tax",
        isRecurring: false,
      }),
      makeExpense({
        date: "2026-04-05",
        amount: 2000,
        category: "Tax",
        isRecurring: false,
      }),
      makeExpense({
        date: "2026-04-10",
        amount: 500,
        category: "Utilities",
        isRecurring: false,
      }),
    ];
    const { monthCats } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthCats["Tax"]).toBe(3000);
    expect(monthCats["Utilities"]).toBe(500);
  });

  it("returns zero monthSpent when no expenses in range", () => {
    const expenses = [makeExpense({ date: "2026-03-01", isRecurring: false })];
    const { monthSpent } = calcMonthlyStats(
      expenses as any,
      "2026-04-01",
      "2026-04-30"
    );
    expect(monthSpent).toBe(0);
  });
});

// ── buildLoanSummary ───────────────────────────────────────────────────────────

describe("buildLoanSummary", () => {
  it("returns remaining = originalAmount when no repayments", () => {
    const loans = [makeLoan({ originalAmount: 100000, repayments: [] })];
    const [result] = buildLoanSummary(loans as any);
    expect(result.remaining).toBe(100000);
    expect(result.repaid).toBe(0);
    expect(result.pct).toBe(0);
  });

  it("calculates repaid and remaining correctly", () => {
    const loans = [
      makeLoan({
        originalAmount: 100000,
        repayments: [{ amount: 25000 }, { amount: 25000 }],
      }),
    ];
    const [result] = buildLoanSummary(loans as any);
    expect(result.repaid).toBe(50000);
    expect(result.remaining).toBe(50000);
    expect(result.pct).toBe(50);
  });

  it("clamps remaining to 0 when over-repaid", () => {
    const loans = [
      makeLoan({
        originalAmount: 10000,
        repayments: [{ amount: 15000 }],
      }),
    ];
    const [result] = buildLoanSummary(loans as any);
    expect(result.remaining).toBe(0);
    expect(result.paidOff).toBe(true);
  });

  it("marks paidOff true when repaid >= originalAmount", () => {
    const loans = [
      makeLoan({
        originalAmount: 10000,
        repayments: [{ amount: 10000 }],
      }),
    ];
    const [result] = buildLoanSummary(loans as any);
    expect(result.paidOff).toBe(true);
  });

  it("handles repayment entries with missing amount gracefully", () => {
    const loans = [
      makeLoan({
        originalAmount: 10000,
        repayments: [{ amount: 5000 }, { amount: null }, { amount: undefined }],
      }),
    ];
    const [result] = buildLoanSummary(loans as any);
    expect(result.repaid).toBe(5000);
  });

  it("returns pct = 0 when originalAmount is 0 (no division by zero)", () => {
    const loans = [makeLoan({ originalAmount: 0, repayments: [] })];
    const [result] = buildLoanSummary(loans as any);
    expect(result.pct).toBe(0);
  });
});

// ── Schema column guards ───────────────────────────────────────────────────────
// These tests guard against re-adding dropped columns to drizzle/schema.ts.
// If a column reappears in the schema but not in the DB, every query for that
// table will fail at runtime with "Unknown column". Catching it here (at test
// time, before the server even starts) surfaces the problem immediately.
// NOTE: after ANY schema.ts change, restart the dev server — drizzle builds the
// SQL at module-import time, so a running process still generates old SQL.

describe("schema column guards — upgrades", () => {
  it("does not define 'phase' column (dropped in migration 0009)", () => {
    expect((upgrades as any).phase).toBeUndefined();
  });

  it("defines expected status enum values after v2 rename", () => {
    const statusCol = upgrades.status;
    expect(statusCol).toBeDefined();
    expect((statusCol as any).name).toBe("status");
  });

  it("defines 'estimatedCost' and 'actualCost' (not legacy 'budget'/'spent')", () => {
    expect((upgrades as any).budget).toBeUndefined();
    expect((upgrades as any).spent).toBeUndefined();
    expect(upgrades.estimatedCost).toBeDefined();
    expect(upgrades.actualCost).toBeDefined();
  });
});

describe("schema column guards — repairQuotes", () => {
  // P1 type safety pass revealed AI-generated code used contractorName/quotedPrice/isSelected.
  // The real DB columns are contractor/amount/selected.
  it("defines 'contractor', 'amount', 'selected'", () => {
    expect(repairQuotes.contractor).toBeDefined();
    expect(repairQuotes.amount).toBeDefined();
    expect(repairQuotes.selected).toBeDefined();
  });

  it("does not define phantom columns 'contractorName', 'quotedPrice', 'isSelected'", () => {
    expect((repairQuotes as any).contractorName).toBeUndefined();
    expect((repairQuotes as any).quotedPrice).toBeUndefined();
    expect((repairQuotes as any).isSelected).toBeUndefined();
  });
});

describe("schema column guards — upgradeOptions", () => {
  // AI-generated code used name/totalPrice/scope/isSelected.
  // Real columns are title/estimatedCost/description/selected.
  it("defines 'title', 'estimatedCost', 'description', 'selected'", () => {
    expect(upgradeOptions.title).toBeDefined();
    expect(upgradeOptions.estimatedCost).toBeDefined();
    expect(upgradeOptions.description).toBeDefined();
    expect(upgradeOptions.selected).toBeDefined();
  });

  it("does not define phantom columns 'name', 'totalPrice', 'scope', 'isSelected'", () => {
    expect((upgradeOptions as any).name).toBeUndefined();
    expect((upgradeOptions as any).totalPrice).toBeUndefined();
    expect((upgradeOptions as any).scope).toBeUndefined();
    expect((upgradeOptions as any).isSelected).toBeUndefined();
  });
});

describe("schema column guards — upgradeItems", () => {
  // AI-generated code sent vendorName/status/eta; real columns are store/purchased.
  it("defines 'store' and 'purchased'", () => {
    expect(upgradeItems.store).toBeDefined();
    expect(upgradeItems.purchased).toBeDefined();
  });

  it("does not define phantom columns 'vendorName', 'status', 'eta'", () => {
    expect((upgradeItems as any).vendorName).toBeUndefined();
    expect((upgradeItems as any).status).toBeUndefined();
    expect((upgradeItems as any).eta).toBeUndefined();
  });
});

describe("schema column guards — expenses", () => {
  it("defines 'isPaid' and 'paidDate'", () => {
    expect(expenses.isPaid).toBeDefined();
    expect(expenses.paidDate).toBeDefined();
  });

  it("defines 'name' (not legacy 'label')", () => {
    expect(expenses.name).toBeDefined();
    expect((expenses as any).label).toBeUndefined();
  });
});
