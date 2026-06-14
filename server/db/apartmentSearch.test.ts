import { describe, it, expect } from "vitest";
import { buildWizardInputFromCandidate } from "./apartmentSearch";

// Minimal candidate factory — only the fields the mapper reads.
const candidate = (over: Record<string, unknown> = {}) =>
  ({
    title: "Rothschild 12, 3rd floor",
    address: "Rothschild Blvd 12, Tel Aviv",
    squareMeters: 75,
    rooms: 3,
    floor: 3,
    yearBuilt: 1998,
    parkingSpots: 1,
    hasElevator: true,
    hasStorage: false,
    price: 850000,
    deposit: 170000,
    agentName: "Dana Levi",
    ...over,
  }) as any;

describe("buildWizardInputFromCandidate", () => {
  it("maps a rent search to a tenant property with rent, deposit and landlord", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "rent" },
      candidate({ price: 6500, deposit: 13000 })
    );
    expect(input.mode).toBe("rented");
    expect(input.monthlyRent).toBe(6500);
    expect(input.deposit).toBe(13000);
    expect(input.landlord).toBe("Dana Levi");
    // Purchase-only fields must not leak into a rental.
    expect(input.purchasePrice).toBeUndefined();
    expect(input.purchaseDate).toBeUndefined();
  });

  it("maps a buy search to an owned property with purchase price and today's date", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "buy" },
      candidate({ price: 2_400_000 })
    );
    expect(input.mode).toBe("owned_personal");
    expect(input.purchasePrice).toBe(2_400_000);
    expect(input.purchaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Rental-only fields must not leak into a purchase.
    expect(input.monthlyRent).toBeUndefined();
    expect(input.deposit).toBeUndefined();
  });

  it("carries over the shared physical attributes and title", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "buy" },
      candidate()
    );
    expect(input.houseName).toBe("Rothschild 12, 3rd floor");
    expect(input.propertyType).toBe("Apartment");
    expect(input.address).toBe("Rothschild Blvd 12, Tel Aviv");
    expect(input.squareMeters).toBe(75);
    expect(input.rooms).toBe(3);
    expect(input.floor).toBe(3);
    expect(input.yearBuilt).toBe(1998);
    expect(input.parkingSpots).toBe(1);
    expect(input.hasElevator).toBe(true);
    expect(input.hasStorage).toBe(false);
  });

  it("carries over the new technical details (type, floors, garden)", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "buy" },
      candidate({ propertyType: "House", floors: 2, gardenSize: 120 })
    );
    expect(input.propertyType).toBe("House");
    expect(input.floors).toBe(2);
    expect(input.gardenSize).toBe(120);
  });

  it("falls back to Apartment when propertyType is missing", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "buy" },
      candidate({ propertyType: null })
    );
    expect(input.propertyType).toBe("Apartment");
  });

  it("drops non-positive or missing numeric fields rather than sending zeros", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "buy" },
      candidate({ price: 0, squareMeters: 0, rooms: null })
    );
    // wizard input rejects non-positive prices/sizes; mapper omits them.
    expect(input.purchasePrice).toBeUndefined();
    expect(input.squareMeters).toBeUndefined();
    expect(input.rooms).toBeUndefined();
  });

  it("coerces a null address to undefined", () => {
    const input = buildWizardInputFromCandidate(
      { searchType: "rent" },
      candidate({ address: null })
    );
    expect(input.address).toBeUndefined();
  });
});
