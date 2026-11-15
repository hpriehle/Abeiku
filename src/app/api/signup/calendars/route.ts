// POST /api/signup/calendars: step 3 (optional), the owner's calendar links. Stored on the
// hotel and, when docs/l2-feeds/calendar-feeds.sql has run, as feeds the booking sync reads.

import { NextRequest, NextResponse } from "next/server";
import { getHotelById, updateHotel } from "@/lib/db";
import { syncSignupLinks } from "@/lib/db/hotel-feeds";
import { parseCalendarLinks } from "@/lib/billing/signup-input";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const parsed = parseCalendarLinks((await request.json().catch(() => ({}))) as Record<string, unknown>);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const before = (await getHotelById(session.hotelId))?.calendar_links ?? null;
    await updateHotel(session.hotelId, { calendar_links: parsed.value });
    await syncSignupLinks(session.hotelId, before, parsed.value);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, "calendars");
  }
}
