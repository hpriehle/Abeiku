import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getTemplateSentCounts, getLatestReviewDelta } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [counts, latestDelta] = await Promise.all([
      getTemplateSentCounts(session.hotelId),
      getLatestReviewDelta(session.hotelId),
    ]);

    const totalRequestsSent = counts["review_request"] ?? 0;
    const totalClicks = counts["google_review_click"] ?? 0;
    const clickRate = totalRequestsSent > 0
      ? Math.round((totalClicks / totalRequestsSent) * 100)
      : 0;

    return NextResponse.json({
      totalRequestsSent,
      totalClicks,
      clickRate,
      latestDelta,
    });
  } catch (error) {
    console.error("Review funnel error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel data" }, { status: 500 });
  }
}
