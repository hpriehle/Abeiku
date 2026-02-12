import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getBookingsForMonth, getHotelById } from "@/lib/db";
import { getBookedDates } from "@/lib/calendar";
import { hotelStorage } from "@/lib/hotel-context";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const year = parseInt(searchParams.get("year") || "", 10);
  const month = parseInt(searchParams.get("month") || "", 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDayDate = new Date(year, month, 0);
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  // Fetch DB bookings and Google Calendar busy dates in parallel
  const [bookings, calendarDates] = await Promise.all([
    getBookingsForMonth(session.hotelId, year, month),
    hotelStorage.run({ hotelId: hotel.id, hotel }, () =>
      getBookedDates(firstDay, lastDay)
    ).catch(() => [] as string[]), // gracefully handle if calendar not connected
  ]);

  // Build set of dates covered by DB bookings (to deduplicate against calendar)
  const dbBookedDates = new Set<string>();
  for (const b of bookings) {
    const start = new Date(b.check_in + "T00:00:00");
    const end = new Date(b.check_out + "T00:00:00");
    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dbBookedDates.add(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // External blocked dates = Google Calendar dates NOT in DB bookings
  const blockedDates = calendarDates.filter((d) => !dbBookedDates.has(d));

  // Return only the fields the calendar needs
  const slim = bookings.map((b) => ({
    id: b.id,
    guest_name: b.guest_name,
    room_slug: b.room_slug,
    check_in: b.check_in,
    check_out: b.check_out,
    booking_status: b.booking_status,
    rooms_count: b.rooms_count,
  }));

  return NextResponse.json({ bookings: slim, blockedDates });
}
