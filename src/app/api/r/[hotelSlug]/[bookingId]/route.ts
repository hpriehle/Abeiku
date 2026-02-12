import { NextRequest, NextResponse } from "next/server";
import { getHotelBySlug } from "@/lib/db";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hotelSlug: string; bookingId: string }> }
) {
  const { hotelSlug, bookingId } = await params;

  try {
    const hotel = await getHotelBySlug(hotelSlug);
    if (!hotel?.google_place_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Record the click (fire-and-forget, don't block redirect)
    void supabase
      .from("templates_sent")
      .insert({
        hotel_id: hotel.id,
        booking_id: bookingId,
        phone: "click-tracked",
        template_type: "google_review_click",
      });

    const googleReviewUrl = `https://search.google.com/local/writereview?placeid=${hotel.google_place_id}`;
    return NextResponse.redirect(googleReviewUrl, 302);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
