/**
 * Real-MySQL integration tests for the apartment-search ("hunting") flow.
 * Skipped unless TEST_DATABASE_URL points at a throwaway MySQL:
 *
 *   TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/homevault_test pnpm test
 *
 * Verifies the end-to-end pick flow: create a search, add candidates, advance a
 * stage, and convert the winner into a real property — checking the candidate
 * is linked, marked accepted, and the parent search is completed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)("apartment search flow (real MySQL)", () => {
  let aps: typeof import("./apartmentSearch");
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
    aps = await import("./apartmentSearch");

    const db = await getDb();
    const [res] = await db.insert(schema.users).values({
      openId: `aps-${Date.now()}`,
      email: "aps@example.com",
      name: "APS",
    });
    userId = (res as any).insertId as number;
    const tenantsDb = await import("./tenants");
    tenantId = (await tenantsDb.ensurePersonalTenant(userId, "APS")).tenantId;
  });

  it("creates a search with candidates and lists them user-scoped", async () => {
    const searchId = nanoid();
    await aps.createSearch({
      id: searchId,
      userId,
      tenantId,
      name: "Rental hunt",
      searchType: "rent",
      targetBudget: 700000,
    });

    await aps.createCandidate({
      id: nanoid(),
      searchId,
      userId,
      tenantId,
      title: "Sea view 2BR",
      price: 650000,
      deposit: 130000,
      rooms: 2,
      stage: "saved",
    });
    await aps.createCandidate({
      id: nanoid(),
      searchId,
      userId,
      tenantId,
      title: "Quiet 3BR",
      price: 600000,
      rooms: 3,
      stage: "saved",
    });

    const searches = await aps.getSearches(tenantId);
    expect(searches.find(s => s.id === searchId)).toBeTruthy();

    const candidates = await aps.getCandidates(searchId);
    expect(candidates).toHaveLength(2);

    const counts = await aps.getCandidateCounts([searchId]);
    expect(counts[0]).toMatchObject({ searchId, total: 2, accepted: 0 });
  });

  it("converts an accepted rental candidate into a tenant property", async () => {
    const searchId = nanoid();
    await aps.createSearch({
      id: searchId,
      userId,
      tenantId,
      name: "Convert me",
      searchType: "rent",
    });
    const candidateId = nanoid();
    await aps.createCandidate({
      id: candidateId,
      searchId,
      userId,
      tenantId,
      title: "The one",
      address: "Allenby 1",
      price: 680000,
      deposit: 136000,
      squareMeters: 70,
      rooms: 3,
      agentName: "Agent Smith",
      stage: "applied",
    });

    const { propertyId } = await aps.convertCandidateToProperty(
      userId,
      tenantId,
      candidateId
    );
    expect(propertyId).toBeGreaterThan(0);

    const db = await getDb();
    const [property] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.id, propertyId));
    expect(property.propertyMode).toBe("rented");
    expect(property.monthlyRent).toBe(680000);
    expect(property.landlord).toBe("Agent Smith");

    // The candidate is linked + accepted, and the search is completed.
    const candidate = await aps.getCandidateById(candidateId);
    expect(candidate?.convertedPropertyId).toBe(propertyId);
    expect(candidate?.stage).toBe("accepted");

    const search = await aps.getSearchById(searchId);
    expect(search?.status).toBe("completed");
  });

  it("refuses to convert a candidate owned by another user", async () => {
    const db = await getDb();
    const [other] = await db.insert(schema.users).values({
      openId: `aps-other-${Date.now()}`,
      email: "other@example.com",
      name: "Other",
    });
    const otherUserId = (other as any).insertId as number;
    const tenantsDb = await import("./tenants");
    const otherTenantId = (
      await tenantsDb.ensurePersonalTenant(otherUserId, "Other")
    ).tenantId;

    const searchId = nanoid();
    await aps.createSearch({
      id: searchId,
      userId: otherUserId,
      tenantId: otherTenantId,
      name: "Not yours",
      searchType: "buy",
    });
    const candidateId = nanoid();
    await aps.createCandidate({
      id: candidateId,
      searchId,
      userId: otherUserId,
      tenantId: otherTenantId,
      title: "Off limits",
      price: 1000000,
      stage: "saved",
    });

    // Converting from our tenant must fail — the candidate is in another tenant.
    await expect(
      aps.convertCandidateToProperty(userId, tenantId, candidateId)
    ).rejects.toThrow(/not found/i);
  });
});
