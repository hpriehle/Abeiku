// Netlify scheduled function: every 15 minutes, ask the site to import Aracuya's
// Google booking calendar and OTA iCal feeds (env), and every other hotel's own calendar
// links (hotel_calendar_feeds, docs/l2-feeds), into the bookings table.
// The work happens in the Next route /api/cron/booking-sync (Bearer $CRON_SECRET).
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.

export default async function bookingSync(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[booking-sync] URL and CRON_SECRET must be set");
    return new Response("not configured", { status: 500 });
  }

  const res = await fetch(new URL("/api/cron/booking-sync", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.text();
  // The route returns counts only (no guest data).
  console.log("[booking-sync]", res.status, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "*/15 * * * *",
};
