// POST /api/cron/billing-daily: once a day, "your trial ends in 3 days" emails to owners, and
// platform notes for plans that ended and hotels locked after the 14-day grace period.
// Called by netlify/functions/billing-daily.mts. Auth: Authorization: Bearer $CRON_SECRET.
// Each email is sent once (keyed in billing_events), so a repeat call sends nothing new.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/partner/booking-report";
import { billingDeps } from "@/lib/billing";
import { runDailyBillingCheck } from "@/lib/billing/notices";
import { isMissingColumnError } from "@/lib/billing/store";

export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyBillingCheck(billingDeps());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (isMissingColumnError(err)) return NextResponse.json({ ok: true, skipped: "billing columns missing" });
    console.error("[billing-daily] failed", (err as Error).message);
    return NextResponse.json({ error: "Billing check failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
