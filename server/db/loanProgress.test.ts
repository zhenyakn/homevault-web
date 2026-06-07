import { describe, it, expect } from "vitest";
import { computeLoanProgress } from "@shared/loanProgress";

describe("computeLoanProgress", () => {
  it("reports zero progress when balance equals the original amount", () => {
    const r = computeLoanProgress(100000, 100000);
    expect(r).toEqual({ repaid: 0, remaining: 100000, pct: 0, paidOff: false });
  });

  it("derives progress from currentBalance (the authoritative outstanding)", () => {
    const r = computeLoanProgress(100000, 50000);
    expect(r.repaid).toBe(50000);
    expect(r.remaining).toBe(50000);
    expect(r.pct).toBe(50);
    expect(r.paidOff).toBe(false);
  });

  it("captures pre-tracking paydown (the 7%-vs-0% bug)", () => {
    // Loan entered mid-life: original 100000, already paid down to 93000,
    // no in-app repayment records yet. Progress must reflect the 7% paydown.
    const r = computeLoanProgress(100000, 93000);
    expect(r.repaid).toBe(7000);
    expect(r.pct).toBe(7);
  });

  it("treats a null/undefined balance as fully outstanding", () => {
    expect(computeLoanProgress(100000, null).remaining).toBe(100000);
    expect(computeLoanProgress(100000, undefined).pct).toBe(0);
  });

  it("clamps remaining to 0 and marks paidOff when balance is negative", () => {
    const r = computeLoanProgress(10000, -500);
    expect(r.remaining).toBe(0);
    expect(r.repaid).toBe(10000);
    expect(r.paidOff).toBe(true);
  });

  it("marks paidOff when balance reaches exactly zero", () => {
    const r = computeLoanProgress(10000, 0);
    expect(r.paidOff).toBe(true);
    expect(r.pct).toBe(100);
  });

  it("clamps remaining so it never exceeds the original amount", () => {
    const r = computeLoanProgress(10000, 15000);
    expect(r.remaining).toBe(10000);
    expect(r.repaid).toBe(0);
  });

  it("returns pct = 0 for a zero original amount (no division by zero)", () => {
    const r = computeLoanProgress(0, 0);
    expect(r.pct).toBe(0);
    expect(r.paidOff).toBe(false);
  });

  it("rounds pct to the nearest whole number", () => {
    expect(computeLoanProgress(100000, 66667).pct).toBe(33); // 33.333%
    expect(computeLoanProgress(100000, 66666).pct).toBe(33); // 33.334%
    expect(computeLoanProgress(100000, 99500).pct).toBe(1); // 0.5% → 1
  });
});
