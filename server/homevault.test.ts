import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createTestContext(): TrpcContext {
  const user = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "oauth",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("HomeVault Router Structure", () => {
  it("has all expected routers defined", () => {
    const caller = appRouter.createCaller(createTestContext());
    // Verify that all router namespaces exist
    expect(caller.auth).toBeDefined();
    expect(caller.dashboard).toBeDefined();
    expect(caller.expenses).toBeDefined();
    expect(caller.repairs).toBeDefined();
    expect(caller.upgrades).toBeDefined();
    expect(caller.loans).toBeDefined();
    expect(caller.wishlist).toBeDefined();
    expect(caller.purchaseCosts).toBeDefined();
    expect(caller.calendar).toBeDefined();
    expect(caller.property).toBeDefined();
    expect(caller.profiles).toBeDefined();
  });

  it("auth.me returns the test user", async () => {
    const caller = appRouter.createCaller(createTestContext());
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.email).toBe("test@example.com");
    expect(user?.name).toBe("Test User");
  });

  it("auth.logout clears session", async () => {
    const ctx = createTestContext();
    const clearedCookies: string[] = [];
    (ctx.res as any).clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});

describe("Input Validation", () => {
  it("rejects expense with empty label", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.expenses.create({
        label: "",
        amount: 1000,
        date: "2026-01-01",
        category: "Mortgage",
      })
    ).rejects.toThrow();
  });

  it("rejects expense with negative amount", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.expenses.create({
        label: "Test",
        amount: -100,
        date: "2026-01-01",
        category: "Mortgage",
      })
    ).rejects.toThrow();
  });

  it("rejects repair with empty label", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.repairs.create({
        label: "",
        priority: "Medium",
        status: "Pending",
        dateLogged: "2026-01-01",
      })
    ).rejects.toThrow();
  });

  it("rejects upgrade with zero budget", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.upgrades.create({
        label: "Test",
        status: "Planned",
        budget: 0,
      })
    ).rejects.toThrow();
  });

  it("rejects loan with invalid type", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.loans.create({
        lender: "Test",
        totalAmount: 1000,
        loanType: "InvalidType" as any,
        startDate: "2026-01-01",
      })
    ).rejects.toThrow();
  });

  it("rejects calendar event with empty title", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.calendar.create({
        title: "",
        date: "2026-01-01",
        eventType: "Other",
      })
    ).rejects.toThrow();
  });
});
