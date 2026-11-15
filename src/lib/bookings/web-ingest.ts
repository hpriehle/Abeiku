// Bookings reported by the hotel website (POST /api/public/referral/[hotelSlug]/booking)
// land in the hotel `bookings` table as source "aracuya_web", keyed by booking_ref.
// The calendar sync writes site-created calendar events to the same key, so a booking
// seen both ways is one row.

import type { BookingReport } from "@/lib/partner/booking-report";
import {
  listingFor,
  upsertHotelBooking,
  type HotelBookingPatch,
  type HotelBookingsStore,
} from "./hotel-bookings";

export type { HotelBookingsStore } from "./hotel-bookings";

export const WEB_SOURCE = "aracuya_web" as const;
/** Shown when the report has no guest name (guest_name is NOT NULL in the table). */
export const UNKNOWN_GUEST = "Guest";

function priceOf(r: BookingReport): { total_price: number; currency: string } | null {
  if (r.total_ghs != null) return { total_price: r.total_ghs, currency: "GHS" };
  if (r.room_total_usd != null) return { total_price: r.room_total_usd, currency: "USD" };
  return null;
}

/** Record a website booking event in the hotel bookings table. Returns the row's id (null if there is none). */
export async function recordWebBooking(
  store: HotelBookingsStore,
  input: { hotelId: string; hotelSlug: string; report: BookingReport }
): Promise<string | null> {
  const { hotelId, report: r } = input;

  if (r.event !== "paid") {
    // cancelled / refunded: mark the row if we have it (a row needs dates, so none is created).
    const existing = await store.find(hotelId, WEB_SOURCE, r.booking_ref);
    if (!existing) return null;
    const patch: HotelBookingPatch = { booking_status: "cancelled" };
    if (r.event === "refunded") patch.payment_status = "refunded";
    await store.update(existing.id, patch);
    return existing.id;
  }

  const listing = listingFor(input.hotelSlug);
  const rooms = Math.min(Math.max(r.rooms_count ?? 1, 1), listing.totalRooms);
  const price = priceOf(r);
  // Fields the report knows; null ones never overwrite what the calendar sync filled in.
  const known: HotelBookingPatch = {
    guest_name: r.guest_name ?? undefined,
    phone: r.guest_phone ?? undefined,
    guest_email: r.guest_email ?? undefined,
    guests: r.guests ?? undefined,
    rooms_count: r.rooms_count != null ? rooms : undefined,
    check_in: r.check_in ?? undefined,
    check_out: r.check_out ?? undefined,
    ...(price ?? {}),
    payment_provider: "stripe",
    ref_code: r.ref_code || undefined,
    paid_at: r.paid_at ?? undefined,
  };

  const saved = await upsertHotelBooking(
    store,
    {
      hotel_id: hotelId,
      source: WEB_SOURCE,
      external_ref: r.booking_ref,
      guest_name: r.guest_name ?? UNKNOWN_GUEST,
      phone: r.guest_phone,
      guest_email: r.guest_email,
      guests: r.guests,
      room_slug: listing.roomSlug,
      rooms_count: rooms,
      // Validated as present for "paid".
      check_in: r.check_in!,
      check_out: r.check_out!,
      total_price: price?.total_price ?? 0,
      currency: price?.currency ?? "GHS",
      payment_status: "paid",
      payment_provider: "stripe",
      booking_status: "confirmed",
      calendar_event_id: null,
      ref_code: r.ref_code || null,
      paid_at: r.paid_at,
    },
    // Already there (seen on the calendar first, or a repeat): fill in what the report knows,
    // but a cancel/refund that arrived first is not undone.
    (existing) => ({
      ...known,
      guest_name: r.guest_name ?? (existing.guest_name || UNKNOWN_GUEST),
      payment_status: existing.payment_status === "refunded" ? "refunded" : "paid",
    })
  );
  return saved.id;
}
