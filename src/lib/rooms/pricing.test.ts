import { describe, it, expect } from "vitest";
import { basePriceTier, parsePrice, withBasePrice, validatePricingTiers } from "./pricing";

const multi = [
  { rooms: 1, price: 100, label: "1 Room" },
  { rooms: 2, price: 180, label: "2 Rooms" },
  { rooms: 4, price: 320, label: "Entire House" },
];

describe("withBasePrice (audit B6: editing a room wiped multi-room pricing)", () => {
  it("changes only the single-room price and keeps the other tiers", () => {
    const out = withBasePrice(multi, 120, "standard");
    expect(out).toEqual([
      { rooms: 1, price: 120, label: "1 Room" },
      { rooms: 2, price: 180, label: "2 Rooms" },
      { rooms: 4, price: 320, label: "Entire House" },
    ]);
    expect(multi[0].price).toBe(100); // input not mutated
  });
  it("finds the 1-room tier even if it is not first", () => {
    const out = withBasePrice([multi[1], multi[0]], 90, "standard");
    expect(out).toEqual([multi[1], { ...multi[0], price: 90 }]);
  });
  it("creates a tier when there is none", () => {
    expect(withBasePrice([], 50, "group")).toEqual([{ rooms: 1, price: 50, label: "Entire House" }]);
    expect(withBasePrice(null, 50, "standard")).toEqual([{ rooms: 1, price: 50, label: "1 Room" }]);
  });
  it("basePriceTier falls back to the first tier", () => {
    expect(basePriceTier([multi[1]])).toEqual(multi[1]);
    expect(basePriceTier(undefined)).toBeUndefined();
  });
});

describe("parsePrice (empty price used to be saved as 0)", () => {
  it("rejects empty, zero, negative and junk", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });
  it("accepts positive numbers", () => {
    expect(parsePrice("120")).toBe(120);
    expect(parsePrice("99.999")).toBe(100);
    expect(parsePrice(45)).toBe(45);
  });
});

describe("validatePricingTiers", () => {
  it("accepts valid tiers", () => expect(validatePricingTiers(multi)).toBeNull());
  it("rejects zero prices and empty lists", () => {
    expect(validatePricingTiers([{ rooms: 1, price: 0, label: "1 Room" }])).toMatch(/more than 0/);
    expect(validatePricingTiers([])).not.toBeNull();
    expect(validatePricingTiers("x")).not.toBeNull();
  });
});
