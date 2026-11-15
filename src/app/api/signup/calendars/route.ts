// POST /api/signup/calendars: step 3 (optional), the owner's calendar links. Stored only.

import { NextRequest, NextResponse } from "next/server";
import { updateHotel } from "@/lib/db";
import { parseCalendarLinks } from "@/lib/billing/signup-input";
import { errorResponse, requireSession } from "@/lib/billing/route-helpers";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const parsed = parseCalendarLinks((await request.json().catch(() => ({}))) as Record<string, unknown>);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await updateHotel(session.hotelId, { calendar_links: parsed.value });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, "calendars");
  }
}
