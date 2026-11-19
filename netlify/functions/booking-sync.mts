// Netlify scheduled function: every 15 minutes, ask the site to import Aracuya's
// Google booking calendar and OTA iCal feeds (env), and every other hotel's own calendar
// links (hotel_calendar_feeds, docs/l2-feeds), into the bookings table.
// The work happens in the Next route /api/cron/booking-sync (Bearer $CRON_SECRET).
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.
// L3: a failed run emails Harrison (src/lib/ops/alerts.ts, at most once an hour).

import { opsAlert } from "../../src/lib/ops/alerts";

export default async function bookingSync(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[booking-sync] URL and CRON_SECRET must be set");
    await opsAlert("booking-sync", "Booking sync is not configured (URL or CRON_SECRET missing)");
    return new Response("not configured", { status: 500 });
  }

  let res: Response;
  let body: string;
  try {
    res = await fetch(new URL("/api/cron/booking-sync", base), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    body = await res.text();
  } catch (err) {
    console.error("[booking-sync] request failed:", err);
    await opsAlert("booking-sync", "Booking sync did not run (request failed or timed out)", err);
    return new Response(null, { status: 502 });
  }
  // The route returns counts only (no guest data).
  console.log("[booking-sync]", res.status, body.slice(0, 500));
  if (!res.ok) await opsAlert("booking-sync", `Booking sync failed (HTTP ${res.status})`, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "*/15 * * * *",
};
