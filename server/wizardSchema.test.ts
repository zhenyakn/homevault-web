/**
 * Pure validation tests for the Add-Property wizard payload schema. No DB — just
 * asserts the zod contract the client must satisfy and the server relies on.
 */
import { describe, it, expect } from "vitest";
import { wizardSchema } from "./routers";

const base = { mode: "owned_personal" as const, houseName: "My Place" };

describe("wizardSchema", () => {
  it("accepts a minimal owned_personal property", () => {
    const r = wizardSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("requires a non-empty houseName", () => {
    expect(wizardSchema.safeParse({ ...base, houseName: "" }).success).toBe(
      false
    );
  });

  it("rejects an unknown mode", () => {
    expect(
      wizardSchema.safeParse({ ...base, mode: "leased" as any }).success
    ).toBe(false);
  });

  it("coerces empty-string dates to undefined", () => {
    const r = wizardSchema.safeParse({
      ...base,
      purchaseDate: "",
      leaseEnd: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.purchaseDate).toBeUndefined();
      expect(r.data.leaseEnd).toBeUndefined();
    }
  });

  it("rejects malformed dates", () => {
    expect(
      wizardSchema.safeParse({ ...base, purchaseDate: "2024/01/01" }).success
    ).toBe(false);
  });

  it("accepts an owned_rented property with mortgage + purchase costs", () => {
    const r = wizardSchema.safeParse({
      mode: "owned_rented",
      houseName: "Allenby Rental",
      purchasePrice: 240000000,
      purchaseDate: "2019-05-01",
      monthlyRent: 650000,
      leaseStart: "2024-01-01",
      leaseEnd: "2024-12-31",
      loan: { lender: "Bank Hapoalim", originalAmount: 120000000 },
      purchaseCosts: [{ name: "Tax", amount: 7200000, category: "Tax" }],
    });
    expect(r.success).toBe(true);
  });

  it("requires a positive loan originalAmount when a loan is provided", () => {
    expect(
      wizardSchema.safeParse({
        ...base,
        loan: { lender: "Bank", originalAmount: 0 },
      }).success
    ).toBe(false);
  });

  it("accepts a rented property with a recurring rent expense", () => {
    const r = wizardSchema.safeParse({
      mode: "rented",
      houseName: "Carmel Sublet",
      monthlyRent: 650000,
      leaseStart: "2024-01-01",
      leaseEnd: "2024-12-31",
      deposit: 1300000,
      landlord: "Mr. Cohen",
      rentExpense: { amount: 650000, date: "2026-04-01" },
    });
    expect(r.success).toBe(true);
    // recurringInterval defaults to monthly
    if (r.success)
      expect(r.data.rentExpense?.recurringInterval).toBe("monthly");
  });
});
