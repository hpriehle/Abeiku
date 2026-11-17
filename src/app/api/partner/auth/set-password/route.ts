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
import { checkInvite, INVITE_MESSAGES } from "@/lib/partner/invite";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { completeSetup } from "@/lib/partner/accounts";
import { HAS_ACCOUNT } from "@/lib/partner/p2-copy";

export async function POST(request: NextRequest) {
  try {
    const { invite_token, password } = await request.json();

    if (!invite_token || !password) {
      return NextResponse.json(
        { error: invite_token ? "Choose a password." : INVITE_MESSAGES.missing },
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
    const invite = checkInvite(invite_token, influencer);
    if (!invite.valid || !influencer) {
      return NextResponse.json(
        { error: invite.valid ? "Invalid link" : invite.message, reason: invite.valid ? "invalid" : invite.reason },
        { status: 400 }
      );
    }

    const hash = await hashPassword(password);
    // With P2 accounts the password is the account's, for all its hotels.
    const outcome = await completeSetup(influencer, hash, supabaseAccountStore, setInfluencerPassword);
    if (outcome.kind === "has_account") {
      return NextResponse.json({ error: HAS_ACCOUNT.message, reason: "has_account" }, { status: 409 });
    }
    const account = outcome.account;
    await markInfluencerLogin(influencer.id);

    const hotel = await getHotelById(influencer.hotel_id);
    if (!hotel) {
      return NextResponse.json({ error: "Your password is set, but signing in failed. Try logging in." }, { status: 500 });
    }

    const token = await createPartnerSessionToken({
      ...(account ? { accountId: account.id } : {}),
      influencerId: influencer.id,
      hotelId: influencer.hotel_id,
      hotelSlug: hotel.slug,
      email: account?.email ?? account?.whatsapp ?? influencer.email ?? influencer.whatsapp ?? "",
      name: account?.name ?? influencer.name,
    });

    const { name, options } = getPartnerSessionCookieOptions();
    const response = NextResponse.json({ success: true });
    response.cookies.set(name, token, options);
    return response;
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  }
}
