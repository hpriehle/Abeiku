// GET /api/cron/lifecycle — Trigger lifecycle messages (check-in reminders, checkout, reviews)
// These are WhatsApp messages TO GUESTS. Scheduled daily by netlify/functions/lifecycle.mts,
// but OFF unless LIFECYCLE_CRON_ENABLED=true (both the function and this route check it).
// Auth: Authorization: Bearer $CRON_SECRET (refused when CRON_SECRET is not set).

import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/partner/booking-report";
import { getAllActiveHotels } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { runLifecycleChecks } from "@/lib/lifecycle";

function lifecycleEnabled(): boolean {
  return process.env.LIFECYCLE_CRON_ENABLED === "true";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!lifecycleEnabled()) {
    return NextResponse.json({ success: true, skipped: "disabled (set LIFECYCLE_CRON_ENABLED=true to send guest messages)" });
  }

  try {
    const hotels = (await getAllActiveHotels()).filter((h) => !h.suspended_at);
    const allResults: Record<string, {
      checkinReminders: number;
      checkoutReminders: number;
      reviewRequests: number;
      wakeupCalls: number;
      returnOffers: number;
      photoInvites: number;
      errors: string[];
    }> = {};

    for (const hotel of hotels) {
      try {
        const results = await hotelStorage.run(
          { hotelId: hotel.id, hotel },
          () => runLifecycleChecks()
        );
        allResults[hotel.slug] = results;
      } catch (err) {
        allResults[hotel.slug] = {
          checkinReminders: 0,
          checkoutReminders: 0,
          reviewRequests: 0,
          wakeupCalls: 0,
          returnOffers: 0,
          photoInvites: 0,
          errors: [`Hotel-level error: ${err}`],
        };
      }
    }

    return NextResponse.json({
      success: true,
      hotels: Object.keys(allResults).length,
      results: allResults,
    });
  } catch (error) {
    console.error("Lifecycle cron error:", error);
    return NextResponse.json(
      { error: "Failed to run lifecycle checks" },
      { status: 500 }
    );
  }
}
