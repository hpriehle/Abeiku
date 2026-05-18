import { NextRequest, NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import {
  getInfluencerByInviteToken,
  setInfluencerPassword,
  markInfluencerLogin,
} from "@/lib/db/influencers";
import {
  hashPassword,
  createPartnerSessionToken,
  getPartnerSessionCookieOptions,
} from "@/lib/partner/auth";

export async function POST(request: NextRequest) {
  try {
    const { invite_token, password } = await request.json();

    if (!invite_token || !password) {
      return NextResponse.json(
        { error: "invite_token and password required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const influencer = await getInfluencerByInviteToken(invite_token);
    if (!influencer) {
      return NextResponse.json({ error: "Invalid or used invite link" }, { status: 400 });
    }

    if (influencer.invite_expires_at && new Date(influencer.invite_expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite link has expired" }, { status: 400 });
    }

    const hash = await hashPassword(password);
    await setInfluencerPassword(influencer.id, hash);
    await markInfluencerLogin(influencer.id);

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

    const { name, options } = getPartnerSessionCookieOptions();
    const response = NextResponse.json({ success: true });
    response.cookies.set(name, token, options);
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
