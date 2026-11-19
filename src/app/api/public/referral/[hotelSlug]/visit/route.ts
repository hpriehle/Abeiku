import { NextRequest, NextResponse } from "next/server";
import { getHotelBySlug } from "@/lib/db";
import { getInfluencerBySlug, hasClickSince, logClick } from "@/lib/db/influencers";
import { isCountableClick, REPEAT_CLICK_WINDOW_MS } from "@/lib/partner/clicks";

const ALLOWED_ORIGINS = new Set([
  "https://aracuya.com",
  "https://www.aracuya.com",
  "http://localhost:3001",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://aracuya.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hotelSlug: string }> }
) {
  const { hotelSlug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: {
    slug?: string;
    ip_hash?: string;
    user_agent?: string;
    referer?: string;
    country?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const slug = (body.slug ?? "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400, headers });
  }

  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404, headers });
  }

  const influencer = await getInfluencerBySlug(hotel.id, slug);
  if (!influencer) {
    return NextResponse.json({ not_found: true }, { status: 404, headers });
  }

  try {
    // Bots, link previews and repeat visits get the same answer; they just don't count as a click.
    const since = new Date(Date.now() - REPEAT_CLICK_WINDOW_MS).toISOString();
    const counts =
      isCountableClick(body.user_agent) &&
      !(body.ip_hash && (await hasClickSince(influencer.id, body.ip_hash, since)));
    if (counts) await logClick({
      influencer_id: influencer.id,
      ip_hash: body.ip_hash ?? null,
      user_agent: body.user_agent ?? null,
      referer: body.referer ?? null,
      country: body.country ?? null,
    });
  } catch (err) {
    console.error("Failed to log influencer click", err);
  }

  return NextResponse.json({ redirect_url: influencer.redirect_url }, { headers });
}
