import type { PricingTier } from "@/lib/db";

/** The tier the room form edits: the one for a single room (falls back to the first tier). */
export function basePriceTier(tiers: PricingTier[] | null | undefined): PricingTier | undefined {
  if (!tiers || tiers.length === 0) return undefined;
  return tiers.find((t) => t.rooms === 1) ?? tiers[0];
}

/** Parse the price typed in the room form. Returns null when it is empty or not a positive number. */
export function parsePrice(input: string | number): number | null {
  if (typeof input === "string" && input.trim() === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Set the single-room price while keeping every other tier (multi-room
 * pricing such as "2 Rooms" / "Entire House") exactly as it was.
 * Audit B6: the edit form used to replace the whole list with one tier.
 */
export function withBasePrice(
  tiers: PricingTier[] | null | undefined,
  price: number,
  roomType: "standard" | "group" | "individual"
): PricingTier[] {
  const defaultLabel = roomType === "group" ? "Entire House" : "1 Room";
  const list = Array.isArray(tiers) ? tiers.map((t) => ({ ...t })) : [];
  const base = basePriceTier(list);
  if (!base) return [{ rooms: 1, price, label: defaultLabel }];
  base.price = price;
  return list;
}

/** Server-side check for a pricing_tiers payload. Returns an error message or null. */
export function validatePricingTiers(tiers: unknown): string | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return "Add a price for this room.";
  for (const t of tiers) {
    if (!t || typeof t !== "object") return "Room prices are not valid.";
    const { rooms, price } = t as Partial<PricingTier>;
    if (typeof rooms !== "number" || !Number.isInteger(rooms) || rooms < 1) return "Room prices are not valid.";
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "Every price must be more than 0.";
  }
  return null;
}
