import { eq, and, desc, inArray } from "drizzle-orm";
import {
  apartmentSearches,
  apartmentCandidates,
  type ApartmentSearch,
  type ApartmentCandidate,
} from "../../drizzle/schema";
import { getDb } from "./client";
import {
  createPropertyWithWizard,
  type PropertyWizardInput,
} from "./properties";

// Everything here is scoped by `userId` — apartment-search rows belong to a
// user account, not to an active property (see schema.ts for the rationale).

// ─── Searches ──────────────────────────────────────────────────────────────────

export async function getSearches(userId: number): Promise<ApartmentSearch[]> {
  const db = await getDb();
  return await db
    .select()
    .from(apartmentSearches)
    .where(eq(apartmentSearches.userId, userId))
    .orderBy(desc(apartmentSearches.createdAt));
}

export async function getSearchById(id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(apartmentSearches)
    .where(eq(apartmentSearches.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSearch(
  data: typeof apartmentSearches.$inferInsert
) {
  const db = await getDb();
  await db.insert(apartmentSearches).values(data);
  return data;
}

export async function updateSearch(
  id: string,
  userId: number,
  data: Partial<ApartmentSearch>
) {
  const db = await getDb();
  await db
    .update(apartmentSearches)
    .set(data)
    .where(
      and(eq(apartmentSearches.id, id), eq(apartmentSearches.userId, userId))
    );
  return data;
}

export async function deleteSearch(id: string, userId: number) {
  const db = await getDb();
  await db
    .delete(apartmentSearches)
    .where(
      and(eq(apartmentSearches.id, id), eq(apartmentSearches.userId, userId))
    );
  return true;
}

// ─── Candidates ─────────────────────────────────────────────────────────────────

export async function getCandidates(
  searchId: string
): Promise<ApartmentCandidate[]> {
  const db = await getDb();
  return await db
    .select()
    .from(apartmentCandidates)
    .where(eq(apartmentCandidates.searchId, searchId))
    .orderBy(desc(apartmentCandidates.createdAt));
}

/** Per-search candidate counts, used to annotate the search list. */
export async function getCandidateCounts(searchIds: string[]) {
  if (searchIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      searchId: apartmentCandidates.searchId,
      stage: apartmentCandidates.stage,
    })
    .from(apartmentCandidates)
    .where(inArray(apartmentCandidates.searchId, searchIds));

  const map: Record<string, { total: number; accepted: number }> = {};
  for (const r of rows) {
    if (!map[r.searchId]) map[r.searchId] = { total: 0, accepted: 0 };
    map[r.searchId].total++;
    if (r.stage === "accepted") map[r.searchId].accepted++;
  }
  return Object.entries(map).map(([searchId, c]) => ({ searchId, ...c }));
}

export async function getCandidateById(id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(apartmentCandidates)
    .where(eq(apartmentCandidates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCandidate(
  data: typeof apartmentCandidates.$inferInsert
) {
  const db = await getDb();
  await db.insert(apartmentCandidates).values(data);
  return data;
}

export async function updateCandidate(
  id: string,
  userId: number,
  data: Partial<ApartmentCandidate>
) {
  const db = await getDb();
  await db
    .update(apartmentCandidates)
    .set(data)
    .where(
      and(
        eq(apartmentCandidates.id, id),
        eq(apartmentCandidates.userId, userId)
      )
    );
  return data;
}

export async function deleteCandidate(id: string, userId: number) {
  const db = await getDb();
  await db
    .delete(apartmentCandidates)
    .where(
      and(
        eq(apartmentCandidates.id, id),
        eq(apartmentCandidates.userId, userId)
      )
    );
  return true;
}

// ─── Convert candidate → tracked property ────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);
const posOrUndef = (n: number | null | undefined) =>
  typeof n === "number" && n > 0 ? n : undefined;

/**
 * Pure mapping from a candidate (+ its parent search) onto the property-wizard
 * payload. Extracted so it can be unit-tested without a database: a rent search
 * becomes a tenant property (monthly rent + deposit + landlord), a buy search
 * becomes an owner-occupied property (purchase price + today's date).
 */
export function buildWizardInputFromCandidate(
  search: Pick<ApartmentSearch, "searchType">,
  candidate: Pick<
    ApartmentCandidate,
    | "title"
    | "address"
    | "squareMeters"
    | "rooms"
    | "floor"
    | "yearBuilt"
    | "parkingSpots"
    | "hasElevator"
    | "hasStorage"
    | "price"
    | "deposit"
    | "agentName"
  >
): PropertyWizardInput {
  const base: PropertyWizardInput = {
    mode: search.searchType === "rent" ? "rented" : "owned_personal",
    houseName: candidate.title,
    propertyType: "Apartment",
    address: candidate.address ?? undefined,
    squareMeters: posOrUndef(candidate.squareMeters),
    rooms: posOrUndef(candidate.rooms),
    yearBuilt: candidate.yearBuilt ?? undefined,
    floor: candidate.floor ?? undefined,
    parkingSpots: candidate.parkingSpots ?? undefined,
    hasElevator: candidate.hasElevator ?? undefined,
    hasStorage: candidate.hasStorage ?? undefined,
  };

  if (search.searchType === "rent") {
    return {
      ...base,
      monthlyRent: posOrUndef(candidate.price),
      deposit: candidate.deposit ?? undefined,
      landlord: candidate.agentName ?? undefined,
    };
  }
  return {
    ...base,
    purchasePrice: posOrUndef(candidate.price),
    purchaseDate: todayIso(),
  };
}

/**
 * Convert an accepted candidate into a real property. Creates the property via
 * the shared wizard, then marks the candidate accepted + links it and flips the
 * parent search to completed. Returns the new property id.
 */
export async function convertCandidateToProperty(
  userId: number,
  candidateId: string
): Promise<{ propertyId: number }> {
  const candidate = await getCandidateById(candidateId);
  if (!candidate || candidate.userId !== userId) {
    throw new Error("Candidate not found");
  }
  const search = await getSearchById(candidate.searchId);
  if (!search || search.userId !== userId) {
    throw new Error("Search not found");
  }

  const input = buildWizardInputFromCandidate(search, candidate);
  const { insertId } = await createPropertyWithWizard(userId, input);

  await updateCandidate(candidateId, userId, {
    stage: "accepted",
    convertedPropertyId: insertId,
  });
  await updateSearch(search.id, userId, { status: "completed" });

  return { propertyId: insertId };
}
