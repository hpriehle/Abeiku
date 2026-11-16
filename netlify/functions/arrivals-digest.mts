// Netlify scheduled function: every day at 18:00 UTC (= 18:00 in Ghana), ask the site to
// email each hotel the list of tomorrow's arrivals. The work happens in the Next route
// /api/cron/arrivals-digest (Bearer $CRON_SECRET); it sends at most one digest per date.
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.

export default async function arrivalsDigest(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[arrivals-digest] URL and CRON_SECRET must be set");
    return new Response("not configured", { status: 500 });
  }

  const res = await fetch(new URL("/api/cron/arrivals-digest", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.text();
  // The route returns counts only (no guest data).
  console.log("[arrivals-digest]", res.status, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "0 18 * * *",
};
