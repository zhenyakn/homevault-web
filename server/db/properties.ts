import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  properties,
  loans,
  purchaseCosts,
  expenses,
  type Property,
} from "../../drizzle/schema";
import { getDb } from "./client";

/** Input accepted by createPropertyWithWizard (mirrors wizardSchema in routers.ts). */
export type PropertyWizardInput = {
  mode: "owned_rented" | "owned_personal" | "rented";
  houseName: string;
  houseNickname?: string;
  propertyType?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  squareMeters?: number;
  rooms?: number;
  yearBuilt?: number;
  floor?: number;
  floors?: number;
  gardenSize?: number;
  parkingSpots?: number;
  hasStorage?: boolean;
  hasElevator?: boolean;
  hasShelter?: boolean;
  purchasePrice?: number;
  purchaseDate?: string;
  monthlyRent?: number;
  leaseStart?: string;
  leaseEnd?: string;
  deposit?: number;
  landlord?: string;
  loan?: {
    name?: string;
    lender?: string;
    originalAmount: number;
    currentBalance?: number;
    interestRate?: number;
    monthlyPayment?: number;
    startDate?: string;
    endDate?: string;
  };
  purchaseCosts?: {
    name: string;
    amount: number;
    category?: string;
    date?: string;
  }[];
  rentExpense?: {
    amount: number;
    recurringInterval: "monthly" | "quarterly" | "yearly";
    date: string;
  };
};

export async function getProperty(propertyId: number = 1) {
  const db = await getDb();
  const result = await db
    .select()
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPropertiesByUser(userId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(properties)
    .where(eq(properties.userId, userId));
}

/** Properties owned by a tenant — the tenant-scoped replacement for
 *  getPropertiesByUser now that data is shared across a tenant's members. */
export async function getPropertiesByTenant(tenantId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(properties)
    .where(eq(properties.tenantId, tenantId));
}

/** All properties across all users — used by the reminder sweep. */
export async function getAllProperties() {
  const db = await getDb();
  return await db.select().from(properties);
}

export async function checkPropertyOwnership(
  userId: number,
  propertyId: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.userId, userId), eq(properties.id, propertyId)))
    .limit(1);
  return result.length > 0;
}

/** Whether a property belongs to the given tenant — the tenant-scoped gate
 *  used by the request context and by property mutations. */
export async function checkPropertyInTenant(
  tenantId: number,
  propertyId: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId))
    )
    .limit(1);
  return result.length > 0;
}

export async function createProperty(
  userId: number,
  tenantId: number,
  data: Partial<typeof properties.$inferInsert> = {}
) {
  const db = await getDb();
  const result = await db
    .insert(properties)
    .values({ userId, tenantId, houseName: "New Property", ...data });
  return result[0];
}

/**
 * Create a property plus its optional linked records in a single transaction.
 * Only purchased modes attach a mortgage / purchase costs; only the tenant mode
 * mirrors a recurring rent expense (a landlord's rent stays informational on the
 * property row). Child rows reference the newly-inserted property id.
 */
export async function createPropertyWithWizard(
  userId: number,
  tenantId: number,
  input: PropertyWizardInput
) {
  const db = await getDb();
  const isPurchased =
    input.mode === "owned_rented" || input.mode === "owned_personal";

  return await db.transaction(async tx => {
    const [res] = await tx.insert(properties).values({
      userId,
      tenantId,
      propertyMode: input.mode,
      houseName: input.houseName,
      houseNickname: input.houseNickname,
      propertyType: input.propertyType,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      squareMeters: input.squareMeters,
      rooms: input.rooms,
      yearBuilt: input.yearBuilt,
      floor: input.floor,
      floors: input.floors,
      gardenSize: input.gardenSize,
      parkingSpots: input.parkingSpots,
      hasStorage: input.hasStorage,
      hasElevator: input.hasElevator,
      hasShelter: input.hasShelter,
      // Purchase only applies to owned modes.
      purchasePrice: isPurchased ? input.purchasePrice : undefined,
      purchaseDate: isPurchased ? input.purchaseDate : undefined,
      // Rental terms apply to landlord (owned_rented) and tenant (rented).
      monthlyRent: input.monthlyRent,
      leaseStart: input.leaseStart,
      leaseEnd: input.leaseEnd,
      deposit: input.deposit,
      landlord: input.landlord,
    });
    const propertyId = (res as any).insertId as number;

    if (isPurchased && input.loan) {
      await tx.insert(loans).values({
        id: nanoid(),
        propertyId,
        ownerId: userId,
        tenantId,
        name: input.loan.name ?? input.loan.lender ?? "Mortgage",
        lender: input.loan.lender,
        originalAmount: input.loan.originalAmount,
        currentBalance: input.loan.currentBalance ?? input.loan.originalAmount,
        interestRate: input.loan.interestRate as any,
        monthlyPayment: input.loan.monthlyPayment,
        startDate: input.loan.startDate,
        endDate: input.loan.endDate,
        loanType: "mortgage",
      });
    }

    if (isPurchased && input.purchaseCosts?.length) {
      await tx.insert(purchaseCosts).values(
        input.purchaseCosts.map(c => ({
          id: nanoid(),
          propertyId,
          ownerId: userId,
          tenantId,
          name: c.name,
          amount: c.amount,
          category: (c.category ?? "Other") as any,
          date: c.date,
        }))
      );
    }

    // Tenant mode: mirror the rent the user pays as a recurring expense.
    if (input.mode === "rented" && input.rentExpense) {
      await tx.insert(expenses).values({
        id: nanoid(),
        propertyId,
        ownerId: userId,
        tenantId,
        name: "Rent",
        category: "Other",
        amount: input.rentExpense.amount,
        date: input.rentExpense.date,
        isRecurring: true,
        recurringInterval: input.rentExpense.recurringInterval,
      });
    }

    return { insertId: propertyId };
  });
}

export async function updateProperty(
  propertyId: number,
  data: Partial<Property>
) {
  const db = await getDb();
  await db.update(properties).set(data).where(eq(properties.id, propertyId));
  return await getProperty(propertyId);
}

export async function deleteProperty(propertyId: number) {
  const db = await getDb();
  await db.delete(properties).where(eq(properties.id, propertyId));
  return true;
}
