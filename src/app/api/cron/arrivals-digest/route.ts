// POST /api/cron/arrivals-digest — email each hotel with an alert address the list of
// tomorrow's arrivals (hotel staff only, never guests). Called daily at 18:00 Ghana time
// (= UTC) by netlify/functions/arrivals-digest.mts. Auth: Authorization: Bearer $CRON_SECRET
// (refused when CRON_SECRET is not set). Sends at most one digest per hotel per date, so a
// repeat call the same day sends nothing. Optional ?date=YYYY-MM-DD picks the arrival date.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/partner/booking-report";
import { arrivalsDigestFor } from "@/lib/alerts";
import { addDays } from "@/lib/bookings/calendar-view";

export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const asked = request.nextUrl.searchParams.get("date");
  if (asked && !/^\d{4}-\d{2}-\d{2}$/.test(asked)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  // Ghana is UTC+0 all year.
  const tomorrow = asked ?? addDays(new Date().toISOString().slice(0, 10), 1);
  try {
    const result = await arrivalsDigestFor(tomorrow);
    // Counts only: no guest data.
    return NextResponse.json({ ok: true, date: tomorrow, ...result });
  } catch (err) {
    console.error("[arrivals-digest] failed", (err as Error).message);
    return NextResponse.json({ error: "Digest failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
