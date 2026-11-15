// POST /api/signup/hotel: step 2, the hotel's town, number of rooms and contact email.

import { NextRequest, NextResponse } from "next/server";
import { getHotelById, updateHotel } from "@/lib/db";
import { tierForRooms } from "@/lib/billing/plans";
import { parseHotelDetails } from "@/lib/billing/signup-input";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const parsed = parseHotelDetails((await request.json().catch(() => ({}))) as Record<string, unknown>);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
    if (hotel.billing_status !== "pending_card") {
      return NextResponse.json({ error: "Your sign-up is finished. Change rooms on the Plan page." }, { status: 409 });
    }
    const { town, rooms, contactEmail } = parsed.value;
    await updateHotel(hotel.id, {
      location_city: town,
      location_country: hotel.location_country ?? "Ghana",
      contact_email: contactEmail,
      room_count: rooms,
      billing_tier: tierForRooms(rooms),
    });
    return NextResponse.json({ success: true, tier: tierForRooms(rooms) });
  } catch (err) {
    return errorResponse(err, "hotel details");
  }
}
