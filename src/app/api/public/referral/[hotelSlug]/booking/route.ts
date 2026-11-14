import { NextRequest, NextResponse } from "next/server";
import { handleBookingReport } from "@/lib/partner/booking-report";
import { supabaseBookingReportStore } from "@/lib/db/influencers";

// Server-to-server: the hotel site reports paid / refunded / cancelled bookings
// that carried a partner ref code. Auth: Authorization: Bearer $ABEIKU_REFERRAL_SECRET.
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
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("Referral booking report failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
