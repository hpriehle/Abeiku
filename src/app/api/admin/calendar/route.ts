import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getOAuthToken } from "@/lib/db";
import { supabase } from "@/lib/supabase/client";
import { hotelStorage } from "@/lib/hotel-context";
import { getHotelById } from "@/lib/db";
import { listCalendars } from "@/lib/calendar";

/** GET — List user's Google Calendars */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }

  try {
    const calendars = await hotelStorage.run(
      { hotelId: hotel.id, hotel },
      () => listCalendars()
    );
    return NextResponse.json({ calendars });
  } catch (error) {
    console.error("Failed to list calendars:", error);
    return NextResponse.json({ error: "Failed to fetch calendars" }, { status: 500 });
  }
}

/** PUT — Save selected calendar ID */
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { calendarId } = await request.json();
  if (!calendarId || typeof calendarId !== "string") {
    return NextResponse.json({ error: "calendarId required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("oauth_tokens")
    .update({ calendar_id: calendarId, updated_at: new Date().toISOString() })
    .eq("hotel_id", session.hotelId)
    .eq("provider", "google");

  if (error) {
    console.error("Failed to save calendar:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
