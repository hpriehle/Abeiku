// POST /api/cron/booking-sync — import Aracuya's Google booking calendar and OTA iCal
// feeds into the hotel bookings table. Called every 15 minutes by the Netlify scheduled
// function netlify/functions/booking-sync.mts. Auth: Authorization: Bearer $CRON_SECRET
// (refused when CRON_SECRET is not set). Reads the feeds only; writes only to bookings
// (and the booking-alert bookkeeping). Afterwards it emails pending booking alerts to the
// hotel (src/lib/alerts): never to guests.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/partner/booking-report";
import { supabaseBookingReportStore } from "@/lib/db/influencers";
import { supabaseHotelBookingsStore } from "@/lib/db/hotel-bookings";
import { listingFor } from "@/lib/bookings/hotel-bookings";
import { syncHotelBookings } from "@/lib/bookings/calendar-sync";
import { feedConfigFromEnv, readFeeds, SYNC_HOTEL_SLUG } from "@/lib/bookings/feeds";
import { alertsAfterSync, syncedFeedsBefore } from "@/lib/alerts";

export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hotelId = await supabaseBookingReportStore.findHotelId(SYNC_HOTEL_SLUG);
    if (!hotelId) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

    const today = new Date().toISOString().slice(0, 10);
    // Read before the sync: a feed's first successful sync is its backfill (no alerts).
    const syncedBefore = await syncedFeedsBefore(hotelId);
    const { feeds, errors } = await readFeeds(feedConfigFromEnv(), listingFor(SYNC_HOTEL_SLUG).totalRooms, today);
    const summary = await syncHotelBookings({
      store: supabaseHotelBookingsStore,
      hotelId,
      hotelSlug: SYNC_HOTEL_SLUG,
      feeds,
      today,
    });
    if (errors.length) console.error("[booking-sync] feed errors", errors);
    const alerts = await alertsAfterSync({
      hotelId,
      loadedFeeds: feeds.filter((f) => f.bookings).map((f) => f.source),
      syncedBefore,
    }).catch((err) => ({ skipped: `error: ${(err as Error)?.message ?? err}` }));
    // Counts only: no guest data in the response or logs.
    return NextResponse.json({ ok: true, hotel: SYNC_HOTEL_SLUG, ...summary, errors, alerts });
  } catch (err) {
    console.error("[booking-sync] failed", (err as Error).message);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
