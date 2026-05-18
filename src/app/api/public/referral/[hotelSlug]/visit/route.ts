import { NextRequest, NextResponse } from "next/server";
import { getHotelBySlug } from "@/lib/db";
import { getInfluencerBySlug, logClick } from "@/lib/db/influencers";

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
    await logClick({
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
