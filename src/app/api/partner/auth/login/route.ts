import { NextRequest, NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import { getInfluencerByEmail, markInfluencerLogin } from "@/lib/db/influencers";
import {
  verifyPassword,
  createPartnerSessionToken,
  getPartnerSessionCookieOptions,
} from "@/lib/partner/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const influencer = await getInfluencerByEmail(email);
    if (!influencer || !influencer.password_hash) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, influencer.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const hotel = await getHotelById(influencer.hotel_id);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 500 });
    }

    const token = await createPartnerSessionToken({
      influencerId: influencer.id,
      hotelId: influencer.hotel_id,
      hotelSlug: hotel.slug,
      email: influencer.email,
      name: influencer.name,
    });

    await markInfluencerLogin(influencer.id);

    const { name, options } = getPartnerSessionCookieOptions();
    const response = NextResponse.json({ success: true });
    response.cookies.set(name, token, options);
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
