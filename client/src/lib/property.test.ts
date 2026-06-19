import { describe, it, expect } from "vitest";
import {
  resolveActiveProperty,
  propertyDisplayName,
  type PropertyLike,
} from "./property";

const props: PropertyLike[] = [
  { id: 1, houseName: "Tel Aviv Flat", address: "1 Rothschild Blvd" },
  { id: 2, houseName: "Beach House", address: "Herzliya" },
  { id: 3, houseName: "Mom's Apartment", address: null },
];

describe("resolveActiveProperty", () => {
  it("returns the property matching the active id", () => {
    expect(resolveActiveProperty(props, 2)?.id).toBe(2);
  });

  it("falls back to the first property when the active id is missing", () => {
    // 99 was deleted / never existed — must not render an empty selection.
    expect(resolveActiveProperty(props, 99)?.id).toBe(1);
  });

  it("returns undefined when there are no properties", () => {
    expect(resolveActiveProperty([], 1)).toBeUndefined();
    expect(resolveActiveProperty(undefined, 1)).toBeUndefined();
    expect(resolveActiveProperty(null, 1)).toBeUndefined();
  });

  it("handles a single-property list regardless of the active id", () => {
    const one = [{ id: 7, houseName: "Only Home" }];
    expect(resolveActiveProperty(one, 7)?.id).toBe(7);
    expect(resolveActiveProperty(one, 123)?.id).toBe(7);
  });
});

describe("propertyDisplayName", () => {
  it("uses the house name when present", () => {
    expect(propertyDisplayName(props[0], "My Home")).toBe("Tel Aviv Flat");
  });

  it("falls back when the property is missing", () => {
    expect(propertyDisplayName(undefined, "My Home")).toBe("My Home");
    expect(propertyDisplayName(null, "My Home")).toBe("My Home");
  });

  it("falls back when the house name is empty or whitespace", () => {
    expect(propertyDisplayName({ id: 1, houseName: "" }, "My Home")).toBe(
      "My Home"
    );
    expect(propertyDisplayName({ id: 1, houseName: "   " }, "My Home")).toBe(
      "My Home"
    );
    expect(propertyDisplayName({ id: 1, houseName: null }, "My Home")).toBe(
      "My Home"
    );
  });

  it("trims surrounding whitespace from the name", () => {
    expect(propertyDisplayName({ id: 1, houseName: "  Loft  " }, "x")).toBe(
      "Loft"
    );
  });
});
