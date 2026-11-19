// Netlify scheduled function: every day at 09:00 UTC (= 09:00 in Ghana), run the billing check:
// "trial ends in 3 days" emails, and platform notes for ended plans and locked hotels. The work
// happens in the Next route /api/cron/billing-daily (Bearer $CRON_SECRET); each email is sent once.
// Netlify sets URL to the site's main address; BOOKING_SYNC_URL overrides it.

export default async function billingDaily(): Promise<Response> {
  const base = process.env.BOOKING_SYNC_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("[billing-daily] URL and CRON_SECRET must be set");
    return new Response("not configured", { status: 500 });
  }

  const res = await fetch(new URL("/api/cron/billing-daily", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.text();
  console.log("[billing-daily]", res.status, body.slice(0, 500));
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = {
  schedule: "0 9 * * *",
};
