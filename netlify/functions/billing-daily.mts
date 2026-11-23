// Netlify scheduled function: every day at 09:00 UTC (= 09:00 in Ghana), run the billing check:
// "trial ends in 3 days" emails, and platform notes for ended plans and locked hotels. The work
// happens in the Next route /api/cron/billing-daily (Bearer $CRON_SECRET); each email is sent once.
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.
// L3: a failed run emails Harrison (src/lib/ops/alerts.ts, at most once an hour).

import { opsAlert } from "../../src/lib/ops/alerts";

export default async function billingDaily(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[billing-daily] URL and CRON_SECRET must be set");
    await opsAlert("billing-daily", "Billing check is not configured (URL or CRON_SECRET missing)");
    return new Response("not configured", { status: 500 });
  }

  let res: Response;
  let body: string;
  try {
    res = await fetch(new URL("/api/cron/billing-daily", base), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    body = await res.text();
  } catch (err) {
    console.error("[billing-daily] request failed:", err);
    await opsAlert("billing-daily", "Billing check did not run (request failed or timed out)", err);
    return new Response(null, { status: 502 });
  }
  console.log("[billing-daily]", res.status, body.slice(0, 500));
  if (!res.ok) await opsAlert("billing-daily", `Billing check failed (HTTP ${res.status})`, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "0 9 * * *",
};
