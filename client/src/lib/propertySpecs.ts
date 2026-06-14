/**
 * Which spec fields are relevant for each property type.
 *
 * Different dwellings care about different things: an apartment sits on a
 * `floor` and may have an `elevator`; a house has a number of `floors` and a
 * `garden`; a studio has no separate `rooms`. This config drives both the
 * Add-Property wizard and the per-property editor so the form only ever asks
 * for what makes sense, keeping it short and relevant.
 */

export type SpecField =
  | "squareMeters"
  | "gardenSize"
  | "rooms"
  | "floor"
  | "floors"
  | "parkingSpots"
  | "yearBuilt"
  | "hasElevator"
  | "hasStorage"
  | "hasShelter";

/** Field metadata: the i18n label key and whether it's numeric or a toggle. */
export const SPEC_META: Record<
  SpecField,
  { labelKey: string; kind: "num" | "bool" }
> = {
  squareMeters: { labelKey: "wizard.sizeM2", kind: "num" },
  gardenSize: { labelKey: "wizard.gardenSize", kind: "num" },
  rooms: { labelKey: "wizard.rooms", kind: "num" },
  floor: { labelKey: "wizard.floor", kind: "num" },
  floors: { labelKey: "wizard.floors", kind: "num" },
  parkingSpots: { labelKey: "wizard.parking", kind: "num" },
  yearBuilt: { labelKey: "wizard.yearBuilt", kind: "num" },
  hasElevator: { labelKey: "wizard.elevator", kind: "bool" },
  hasStorage: { labelKey: "wizard.storage", kind: "bool" },
  hasShelter: { labelKey: "wizard.shelter", kind: "bool" },
};

// Apartment-like units: a storey + (maybe) an elevator, no garden.
const UNIT: SpecField[] = [
  "squareMeters",
  "rooms",
  "floor",
  "parkingSpots",
  "yearBuilt",
  "hasElevator",
  "hasStorage",
  "hasShelter",
];

// Ground dwellings: own number of floors + a garden, no elevator.
const DWELLING: SpecField[] = [
  "squareMeters",
  "gardenSize",
  "rooms",
  "floors",
  "parkingSpots",
  "yearBuilt",
  "hasStorage",
  "hasShelter",
];

const TYPE_SPECS: Record<string, SpecField[]> = {
  Apartment: UNIT,
  Penthouse: UNIT,
  // A studio is a single open space — drop the room count.
  Studio: UNIT.filter(f => f !== "rooms"),
  House: DWELLING,
  Villa: DWELLING,
  Townhouse: DWELLING,
  Other: [
    "squareMeters",
    "rooms",
    "floor",
    "parkingSpots",
    "yearBuilt",
    "hasStorage",
    "hasShelter",
  ],
};

/** The relevant spec fields for a property type (falls back to a generic set). */
export function getSpecFields(type?: string | null): SpecField[] {
  return TYPE_SPECS[type ?? ""] ?? TYPE_SPECS.Other;
}
