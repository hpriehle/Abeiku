import { NextRequest, NextResponse } from "next/server";

interface BusyPeriod {
  start: string;
  end: string;
}

function getDatesBetween(startISO: string, endISO: string): string[] {
  const dates: string[] = [];
  const current = new Date(startISO);
  const endDate = new Date(endISO);

  while (current < endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export async function GET(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!calendarId || !apiKey) {
    return NextResponse.json({ bookedDates: [] });
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/freeBusy?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: `${start}T00:00:00Z`,
          timeMax: `${end}T23:59:59Z`,
          items: [{ id: calendarId }],
        }),
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      console.error("Google Calendar API error:", res.status, await res.text());
      return NextResponse.json({ bookedDates: [] });
    }

    const data = await res.json();
    const busyPeriods: BusyPeriod[] =
      data.calendars?.[calendarId]?.busy || [];

    const bookedDates = new Set<string>();

    for (const period of busyPeriods) {
      for (const d of getDatesBetween(period.start, period.end)) {
        bookedDates.add(d);
      }
    }

    return NextResponse.json({
      bookedDates: Array.from(bookedDates).sort(),
    });
  } catch (error) {
    console.error("Failed to fetch calendar:", error);
    return NextResponse.json({ bookedDates: [] });
  }
}
