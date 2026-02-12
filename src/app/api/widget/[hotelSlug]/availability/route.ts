import { NextRequest, NextResponse } from "next/server";
import { getHotelBySlug } from "@/lib/db";
import { supabase } from "@/lib/supabase/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hotelSlug: string }> }
) {
  const { hotelSlug } = await params;
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const roomSlug = searchParams.get("roomSlug");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 }
    );
  }

  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }

  // Find bookings that overlap with the requested range
  let query = supabase
    .from("bookings")
    .select("check_in, check_out")
    .eq("hotel_id", hotel.id)
    .in("booking_status", ["confirmed", "checked_in"])
    .lt("check_in", end)
    .gt("check_out", start);

  if (roomSlug) {
    query = query.eq("room_slug", roomSlug);
  }

  const { data: bookings, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
  }

  // Build a set of booked date strings
  const bookedDates = new Set<string>();
  for (const booking of bookings ?? []) {
    const checkIn = new Date(booking.check_in + "T12:00:00");
    const checkOut = new Date(booking.check_out + "T12:00:00");
    const current = new Date(checkIn);
    while (current < checkOut) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      bookedDates.add(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
  }

  const response = NextResponse.json({ bookedDates: Array.from(bookedDates) });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Cache-Control", "public, max-age=60");
  return response;
}
