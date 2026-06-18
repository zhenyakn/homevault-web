/**
 * Real-MySQL integration tests for createPropertyWithWizard. Skipped unless
 * TEST_DATABASE_URL points at a throwaway MySQL:
 *
 *   TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/homevault_test pnpm test
 *
 * Verifies the transactional creation of a property plus its mode-specific
 * linked records (mortgage loan, purchase costs, recurring rent expense).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("createPropertyWithWizard (real MySQL)", () => {
  let props: typeof import("./properties");
  let getDb: typeof import("./client").getDb;
  let schema: typeof import("../../drizzle/schema");
  let userId: number;
  let tenantId: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const { runMigrations } = await import("../_core/migrate");
    await runMigrations({ log: () => {} });

    ({ getDb } = await import("./client"));
    schema = await import("../../drizzle/schema");
    props = await import("./properties");

    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `pw-${Date.now()}`,
      email: "pw@example.com",
      name: "PW",
    });
    userId = (res as any).insertId as number;
    const tenantsDb = await import("./tenants");
    tenantId = (await tenantsDb.ensurePersonalTenant(userId, "PW")).tenantId;
  });

  it("owned_rented: creates property + mortgage + purchase costs, no rent expense", async () => {
    const { insertId } = await props.createPropertyWithWizard(
      userId,
      tenantId,
      {
        mode: "owned_rented",
        houseName: "Wizard Rented Out",
        purchasePrice: 240000000,
        purchaseDate: "2019-05-01",
        monthlyRent: 650000,
        leaseStart: "2024-01-01",
        leaseEnd: "2024-12-31",
        loan: {
          lender: "Bank Hapoalim",
          originalAmount: 120000000,
          monthlyPayment: 540000,
        },
        purchaseCosts: [
          { name: "Tax", amount: 7200000, category: "Tax" },
          { name: "Lawyer", amount: 900000, category: "Legal" },
        ],
      }
    );

    const db = await getDb();
    const [p] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, insertId));
    expect(p.propertyMode).toBe("owned_rented");
    expect(p.purchasePrice).toBe(240000000);
    expect(p.monthlyRent).toBe(650000);

    const loanRows = await db
      .select()
      .from(schema.loans)
      .where(eq(schema.loans.propertyId, insertId));
    expect(loanRows).toHaveLength(1);
    expect(loanRows[0].loanType).toBe("mortgage");
    // currentBalance defaults to originalAmount when omitted
    expect(loanRows[0].currentBalance).toBe(120000000);

    const costRows = await db
      .select()
      .from(schema.purchaseCosts)
      .where(eq(schema.purchaseCosts.propertyId, insertId));
    expect(costRows).toHaveLength(2);

    const expRows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.propertyId, insertId));
    expect(expRows).toHaveLength(0);
  });

  it("rented: creates property + recurring rent expense, no loan/purchase", async () => {
    const { insertId } = await props.createPropertyWithWizard(
      userId,
      tenantId,
      {
        mode: "rented",
        houseName: "Wizard Tenant",
        // purchase fields should be ignored for a rented property
        purchasePrice: 999,
        monthlyRent: 650000,
        leaseStart: "2024-01-01",
        leaseEnd: "2024-12-31",
        deposit: 1300000,
        landlord: "Mr. Cohen",
        rentExpense: {
          amount: 650000,
          recurringInterval: "monthly",
          date: "2026-04-01",
        },
      }
    );

    const db = await getDb();
    const [p] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, insertId));
    expect(p.propertyMode).toBe("rented");
    expect(p.purchasePrice).toBeNull();
    expect(p.landlord).toBe("Mr. Cohen");

    const expRows = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.propertyId, insertId));
    expect(expRows).toHaveLength(1);
    expect(expRows[0].name).toBe("Rent");
    expect(expRows[0].isRecurring).toBe(true);

    const loanRows = await db
      .select()
      .from(schema.loans)
      .where(eq(schema.loans.propertyId, insertId));
    expect(loanRows).toHaveLength(0);
  });

  it("owned_personal: creates property with purchase, no rental records", async () => {
    const { insertId } = await props.createPropertyWithWizard(
      userId,
      tenantId,
      {
        mode: "owned_personal",
        houseName: "Wizard Personal",
        purchasePrice: 280000000,
        purchaseDate: "2022-03-15",
      }
    );

    const db = await getDb();
    const [p] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, insertId));
    expect(p.propertyMode).toBe("owned_personal");
    expect(p.purchasePrice).toBe(280000000);
    expect(p.monthlyRent).toBeNull();
  });
});
