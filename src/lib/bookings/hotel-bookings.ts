// Rows in the hotel `bookings` table that come from outside Abeiku's own
// WhatsApp flow (the hotel website, its Google booking calendar, OTA iCal feeds).
// Keyed by (hotel_id, source, external_ref); see supabase-migration-booking-sources.sql.
// Storage is injected so the logic can be tested with an in-memory store.

export const BOOKING_SOURCES = [
  "aracuya_web",
  "google_calendar",
  "airbnb",
  "vrbo",
  "booking_com",
  "manual",
  "whatsapp",
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/** Sources that are imported and must never get automatic guest messages. */
export const IMPORTED_SOURCES: BookingSource[] = ["aracuya_web", "google_calendar", "airbnb", "vrbo", "booking_com"];

export type HotelBookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type HotelPaymentStatus = "unpaid" | "pending" | "paid" | "refunded";

export interface HotelBookingRow {
  id: string;
  hotel_id: string;
  source: BookingSource;
  external_ref: string;
  guest_name: string;
  phone: string | null;
  guest_email: string | null;
  guests: number | null;
  room_slug: string;
  rooms_count: number;
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  payment_status: HotelPaymentStatus;
  payment_provider: string | null;
  booking_status: HotelBookingStatus;
  calendar_event_id: string | null;
  ref_code: string | null;
  paid_at: string | null;
  /** hotel_calendar_feeds.id for rows from a per-hotel feed (docs/l2-feeds); absent before that SQL. */
  feed_id?: string | null;
}

export type NewHotelBooking = Omit<HotelBookingRow, "id">;
export type HotelBookingPatch = Partial<Omit<HotelBookingRow, "id" | "hotel_id">>;

export interface HotelBookingsStore {
  find(hotelId: string, source: BookingSource, externalRef: string): Promise<HotelBookingRow | null>;
  /** Every row of the hotel from these sources (any status). */
  listBySources(hotelId: string, sources: BookingSource[]): Promise<HotelBookingRow[]>;
  /** Inserts; returns null (and writes nothing) if (hotel, source, external_ref) already exists. */
  insert(row: NewHotelBooking): Promise<HotelBookingRow | null>;
  update(id: string, patch: HotelBookingPatch): Promise<void>;
}

/** Per-hotel booking facts. Aracuya is one listing ("suite") of 3 identical rooms booked by count. */
export const HOTEL_LISTINGS: Record<string, { roomSlug: string; totalRooms: number }> = {
  aracuya: { roomSlug: "suite", totalRooms: 3 },
};

export function listingFor(hotelSlug: string): { roomSlug: string; totalRooms: number } {
  return HOTEL_LISTINGS[hotelSlug] ?? { roomSlug: "main", totalRooms: 1 };
}

/** Fields of `patch` whose value differs from `row` (so unchanged rows cost no write). */
export function changedFields(row: HotelBookingRow, patch: HotelBookingPatch): HotelBookingPatch {
  const out: HotelBookingPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = (row as unknown as Record<string, unknown>)[k];
    // NUMERIC columns can come back as strings.
    const same = cur === v || (typeof v === "number" && cur != null && Number(cur) === v);
    if (!same) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Only the patch fields the row doesn't have yet (null / empty). */
export function fillMissing(row: HotelBookingRow, patch: HotelBookingPatch): HotelBookingPatch {
  const out: HotelBookingPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    const cur = (row as unknown as Record<string, unknown>)[k];
    if (v != null && (cur == null || cur === "")) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Insert, or update the row that already has this key (a concurrent writer may have just created it). */
export async function upsertHotelBooking(
  store: HotelBookingsStore,
  row: NewHotelBooking,
  onExisting: (existing: HotelBookingRow) => HotelBookingPatch
): Promise<HotelBookingRow> {
  const existing = await store.find(row.hotel_id, row.source, row.external_ref);
  if (!existing) {
    const inserted = await store.insert(row);
    if (inserted) return inserted;
  }
  const current = existing ?? (await store.find(row.hotel_id, row.source, row.external_ref));
  if (!current) throw new Error("hotel booking vanished during upsert");
  const patch = changedFields(current, onExisting(current));
  if (Object.keys(patch).length) await store.update(current.id, patch);
  return { ...current, ...patch };
}
