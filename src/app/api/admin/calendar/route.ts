import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getCalendarBookings, getHotelById, getHotelRooms } from "@/lib/db";
import { HOTEL_LISTINGS } from "@/lib/bookings/hotel-bookings";
import { nightsBetween, toCalendarRow } from "@/lib/bookings/calendar-view";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 200;

/** GET /api/admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — read-only. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
  }
  const span = nightsBetween(from, to);
  if (span < 0 || span > MAX_DAYS) {
    return NextResponse.json({ error: `Pick a date range of at most ${MAX_DAYS} days.` }, { status: 400 });
  }

  try {
    const hotel = await getHotelById(session.hotelId);
    if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    const [rows, rooms] = await Promise.all([getCalendarBookings(hotel.id, from, to), getHotelRooms(hotel.id)]);
    const totalRooms =
      HOTEL_LISTINGS[hotel.slug]?.totalRooms ?? Math.max(1, rooms.reduce((s, r) => s + (Number(r.total_rooms) || 1), 0));
    return NextResponse.json({
      bookings: rows.map(toCalendarRow),
      totalRooms,
      currency: hotel.currency || "GHS",
      rooms: rooms.map((r) => ({ slug: r.slug, name: r.name })),
    });
  } catch (err) {
    console.error("[admin/calendar] load failed:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "We couldn't load the calendar. Please try again." }, { status: 500 });
  }
}
