import { NextRequest, NextResponse } from "next/server";
import { handleBookingReport } from "@/lib/partner/booking-report";
import { supabaseBookingReportStore } from "@/lib/db/influencers";
import { supabaseHotelBookingsStore } from "@/lib/db/hotel-bookings";
import { alertBookingIds } from "@/lib/alerts";

// Server-to-server: the hotel site reports paid / refunded / cancelled bookings.
// Every booking is kept in the hotel bookings table; those with a partner ref code
// also get a referral_bookings row for commission. Auth: Authorization: Bearer $ABEIKU_REFERRAL_SECRET.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hotelSlug: string }> }
) {
  const { hotelSlug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  try {
    const result = await handleBookingReport({
      authHeader: request.headers.get("authorization"),
      secret: process.env.ABEIKU_REFERRAL_SECRET,
      hotelSlug,
      // Invalid JSON: auth is still checked first, then the body fails validation (400).
      body: body === undefined ? null : body,
      store: supabaseBookingReportStore,
      hotelBookings: supabaseHotelBookingsStore,
      // New-booking / cancellation email to the hotel (never the guest).
      onHotelBooking: (hotelId, rowId) => alertBookingIds(hotelId, [rowId]),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Referral booking report failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
