import { NextResponse } from "next/server";
import { getPartnerSession } from "@/lib/partner/auth";
import {
  getInfluencerById,
  getTotalClicks,
  getClicksByDay,
  getRecentClicks,
} from "@/lib/db/influencers";

const ARACUYA_URL = process.env.ARACUYA_URL ?? "https://aracuya.com";

export async function GET() {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const influencer = await getInfluencerById(session.influencerId);
  if (!influencer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [total_clicks, clicks_by_day, recent_clicks] = await Promise.all([
    getTotalClicks(influencer.id),
    getClicksByDay(influencer.id, 30),
    getRecentClicks(influencer.id, 20),
  ]);

  const link_url = `${ARACUYA_URL}/${influencer.slug}`;

  return NextResponse.json({
    name: influencer.name,
    email: influencer.email,
    slug: influencer.slug,
    link_url,
    total_clicks,
    clicks_by_day,
    recent_clicks,
  });
}
