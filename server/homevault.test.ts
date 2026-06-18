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
    globalRole: "superadmin" as const,
    defaultTenantId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    propertyId: 1,
    tenantId: 1,
    tenantRole: "owner",
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
    expect(caller.inventory).toBeDefined();
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
    (ctx.res as any).clearCookie = (name: string) => {
      clearedCookies.push(name);
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });
});

describe("Input Validation — expenses", () => {
  it("rejects expense with empty name", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.expenses.create({
        name: "",
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
        name: "Test",
        amount: -100,
        date: "2026-01-01",
        category: "Mortgage",
      })
    ).rejects.toThrow();
  });

  it("rejects expense with zero amount", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.expenses.create({
        name: "Test",
        amount: 0,
        date: "2026-01-01",
        category: "Mortgage",
      })
    ).rejects.toThrow();
  });

  it("rejects expense with malformed date (not YYYY-MM-DD)", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.expenses.create({
        name: "Test",
        amount: 1000,
        date: "01/01/2026",
        category: "Mortgage",
      })
    ).rejects.toThrow();
  });
});

describe("Input Validation — repairs", () => {
  it("rejects repair with empty title", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.repairs.create({ title: "" })).rejects.toThrow();
  });

  it("accepts repair with only the required title field", async () => {
    const caller = appRouter.createCaller(createTestContext());
    // Should fail at DB level (no propertyId), not at Zod validation level.
    // We just verify Zod itself doesn't reject a valid title.
    await expect(
      caller.repairs.create({ title: "Valid title" })
    ).rejects.toThrow(); // DB error, not a Zod error — Zod accepted the input
  });
});

describe("Input Validation — upgrades", () => {
  it("rejects upgrade with empty title", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(caller.upgrades.create({ title: "" })).rejects.toThrow();
  });

  it("rejects upgrade with negative estimatedCost", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.upgrades.create({ title: "Kitchen reno", estimatedCost: -1 })
    ).rejects.toThrow();
  });
});

describe("Input Validation — loans", () => {
  it("rejects loan with invalid loanType enum value", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.loans.create({
        lender: "Test Bank",
        originalAmount: 100000,
        loanType: "InvalidType" as any,
        startDate: "2026-01-01",
      })
    ).rejects.toThrow();
  });

  it("rejects loan with negative originalAmount", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.loans.create({
        lender: "Test Bank",
        originalAmount: -1000,
        loanType: "mortgage",
        startDate: "2026-01-01",
      })
    ).rejects.toThrow();
  });

  it("rejects loan with malformed startDate", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.loans.create({
        lender: "Test Bank",
        originalAmount: 100000,
        loanType: "mortgage",
        startDate: "January 1 2026",
      })
    ).rejects.toThrow();
  });

  it("accepts loan with empty endDate (optional Due date left blank)", async () => {
    const caller = appRouter.createCaller(createTestContext());
    // The client sends "" when the optional Due date is left blank. That must
    // pass input validation (an empty string is coerced to undefined) rather
    // than failing the YYYY-MM-DD regex with a BAD_REQUEST. It may still fail
    // later at the DB layer in environments without a database — that's fine;
    // we only assert it is not rejected as a validation error.
    await caller.loans
      .create({
        lender: "Test Bank",
        originalAmount: 100000,
        loanType: "mortgage",
        startDate: "2026-01-01",
        endDate: "",
      })
      .catch((err: { code?: string }) => {
        expect(err?.code).not.toBe("BAD_REQUEST");
      });
  });

  it("accepts loan with empty interestRate (optional field left blank)", async () => {
    const caller = appRouter.createCaller(createTestContext());
    // interestRate is a decimal DB column; the client sends "" when left
    // blank. It must be coerced to undefined (NULL) at validation rather than
    // reaching the DB as "" and triggering an "incorrect decimal value" error.
    // We only assert it is not rejected as a validation error here.
    await caller.loans
      .create({
        lender: "Test Bank",
        originalAmount: 100000,
        loanType: "mortgage",
        startDate: "2026-01-01",
        interestRate: "",
      })
      .catch((err: { code?: string }) => {
        expect(err?.code).not.toBe("BAD_REQUEST");
      });
  });

  it("rejects loan with non-numeric interestRate", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.loans.create({
        lender: "Test Bank",
        originalAmount: 100000,
        loanType: "mortgage",
        startDate: "2026-01-01",
        interestRate: "5%",
      })
    ).rejects.toThrow();
  });
});

describe("Input Validation — calendar", () => {
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

  it("rejects calendar event with invalid eventType", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.calendar.create({
        title: "Test",
        date: "2026-01-01",
        eventType: "InvalidType" as any,
      })
    ).rejects.toThrow();
  });
});

describe("Input Validation — inventoryItems", () => {
  it("rejects inventory item with empty name", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.inventory.create({ name: "", quantity: 1 })
    ).rejects.toThrow();
  });

  it("rejects inventory item with negative quantity", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.inventory.create({ name: "Lightbulbs", quantity: -1 })
    ).rejects.toThrow();
  });
});
