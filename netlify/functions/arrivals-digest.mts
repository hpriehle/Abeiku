// Netlify scheduled function: every day at 18:00 UTC (= 18:00 in Ghana), ask the site to
// email each hotel the list of tomorrow's arrivals. The work happens in the Next route
// /api/cron/arrivals-digest (Bearer $CRON_SECRET); it sends at most one digest per date.
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.
// L3: a failed run emails Harrison (src/lib/ops/alerts.ts, at most once an hour).

import { opsAlert } from "../../src/lib/ops/alerts";

export default async function arrivalsDigest(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[arrivals-digest] URL and CRON_SECRET must be set");
    await opsAlert("arrivals-digest", "Arrivals digest is not configured (URL or CRON_SECRET missing)");
    return new Response("not configured", { status: 500 });
  }

  let res: Response;
  let body: string;
  try {
    res = await fetch(new URL("/api/cron/arrivals-digest", base), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    body = await res.text();
  } catch (err) {
    console.error("[arrivals-digest] request failed:", err);
    await opsAlert("arrivals-digest", "Arrivals digest did not run (request failed or timed out)", err);
    return new Response(null, { status: 502 });
  }
  // The route returns counts only (no guest data).
  console.log("[arrivals-digest]", res.status, body.slice(0, 500));
  if (!res.ok) await opsAlert("arrivals-digest", `Arrivals digest failed (HTTP ${res.status})`, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "0 18 * * *",
};
