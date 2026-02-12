// GET /api/cron/lifecycle — Trigger lifecycle messages (check-in reminders, checkout, reviews)
// Call this from a cron job (Vercel Cron, external scheduler, or node-cron) once daily.

import { NextRequest, NextResponse } from "next/server";
import { getAllActiveHotels, getHotelById } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { runLifecycleChecks } from "@/lib/lifecycle";

export async function GET(request: NextRequest) {
  // Simple auth: check for a secret token to prevent unauthorized triggering
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hotels = await getAllActiveHotels();
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
