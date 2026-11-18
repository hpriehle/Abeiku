// POST /api/cron/booking-sync — import Aracuya's Google booking calendar and OTA iCal
// feeds (env) into the hotel bookings table, and, next to it, every other hotel's own
// feeds from hotel_calendar_feeds (docs/l2-feeds; skipped until that SQL has run). Called every 15 minutes by the Netlify scheduled
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
import { alertsAfterSync, alertsAfterSyncs, syncedFeedsBefore } from "@/lib/alerts";
import { syncFeedHotels, type FeedSyncSummary } from "@/lib/bookings/feed-sync";
import { supabaseFeedSyncStore } from "@/lib/db/hotel-feeds";
import { googleListerFromEnv } from "@/lib/bookings/google-lister";
import { alertFeedFailures, opsAlert } from "@/lib/ops/alerts";

/** No new feed of another hotel is started after this, nor a hotel saved after WRITE_MS. */
const READ_MS = 9_000;
const WRITE_MS = 18_000;

function otherHotels(excludeHotelIds: string[], today: string, started: number): Promise<FeedSyncSummary | null> {
  return syncFeedHotels({
    store: supabaseFeedSyncStore,
    bookings: supabaseHotelBookingsStore,
    syncedFeeds: syncedFeedsBefore,
    read: { today, listGoogle: googleListerFromEnv() },
    excludeHotelIds,
    readDeadline: started + READ_MS,
    writeDeadline: started + WRITE_MS,
  }).catch(async (err) => {
    console.error("[booking-sync] other hotels failed", (err as Error)?.message ?? err);
    await opsAlert("booking-sync", "Booking sync of the hotels' own calendars failed", err);
    return null;
  });
}

/** Counts only (no links, no guest data). */
function othersReport(o: FeedSyncSummary | null) {
  if (!o) return { error: "failed" };
  if (o.notSetUp) return { notSetUp: true };
  const { alertInputs: _alertInputs, feedErrors: _feedErrors, ...counts } = o;
  void _alertInputs;
  void _feedErrors;
  return counts;
}

export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  try {
    const hotelId = await supabaseBookingReportStore.findHotelId(SYNC_HOTEL_SLUG);
    // Other hotels run alongside Aracuya, so a slow Aracuya feed doesn't eat their time.
    const others = otherHotels(hotelId ? [hotelId] : [], today, started);
    if (!hotelId) {
      const o = await others;
      await alertFeedFailures(o?.feedErrors ?? []);
      if (o?.alertInputs.length) await alertsAfterSyncs(o.alertInputs).catch(() => undefined);
      return NextResponse.json({ error: "Hotel not found", otherHotels: othersReport(o) }, { status: 404 });
    }

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
    const o = await others;
    // L3: email Harrison (hourly at most per hotel) about failed feeds.
    await alertFeedFailures([{ slug: SYNC_HOTEL_SLUG, errors }, ...(o?.feedErrors ?? [])]);
    const aracuyaAlerts = {
      hotelId,
      loadedFeeds: feeds.filter((f) => f.bookings).map((f) => f.source),
      syncedBefore,
    };
    // Only Aracuya: exactly as before. With other hotels: each one's backfill, then one sweep.
    const alerts = await (o?.alertInputs.length ? alertsAfterSyncs([aracuyaAlerts, ...o.alertInputs]) : alertsAfterSync(aracuyaAlerts)).catch(
      (err) => ({ skipped: `error: ${(err as Error)?.message ?? err}` })
    );
    // Counts only: no guest data in the response or logs.
    return NextResponse.json({ ok: true, hotel: SYNC_HOTEL_SLUG, ...summary, errors, alerts, otherHotels: othersReport(o) });
  } catch (err) {
    console.error("[booking-sync] failed", (err as Error).message);
    await opsAlert("booking-sync", "Booking sync failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
