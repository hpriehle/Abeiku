// Netlify scheduled function: daily at 09:00 UTC (= 09:00 in Ghana), run the guest lifecycle
// messages (/api/cron/lifecycle: check-in reminders, review requests, return offers …).
// Those are WhatsApp messages TO GUESTS, so this is OFF until LIFECYCLE_CRON_ENABLED=true
// is set in Netlify (the route checks the same flag). Auth: Bearer $CRON_SECRET.
// L3: a failed run emails Harrison (src/lib/ops/alerts.ts, at most once an hour).

import { opsAlert } from "../../src/lib/ops/alerts";

export default async function lifecycle(): Promise<Response> {
  if (process.env.LIFECYCLE_CRON_ENABLED !== "true") {
    console.log("[lifecycle] disabled (LIFECYCLE_CRON_ENABLED is not true); nothing sent");
    return new Response(null, { status: 200 });
  }
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[lifecycle] URL and CRON_SECRET must be set");
    await opsAlert("lifecycle", "Guest lifecycle messages is not configured (URL or CRON_SECRET missing)");
    return new Response("not configured", { status: 500 });
  }

  let res: Response;
  let body: string;
  try {
    res = await fetch(new URL("/api/cron/lifecycle", base), {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    body = await res.text();
  } catch (err) {
    console.error("[lifecycle] request failed:", err);
    await opsAlert("lifecycle", "Guest lifecycle messages did not run (request failed or timed out)", err);
    return new Response(null, { status: 502 });
  }
  console.log("[lifecycle]", res.status, body.slice(0, 500));
  if (!res.ok) await opsAlert("lifecycle", `Guest lifecycle messages failed (HTTP ${res.status})`, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "0 9 * * *",
};
