import { NextRequest, NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import {
  getInfluencerByEmail,
  getInfluencersByWhatsapp,
  markInfluencerLogin,
  type Influencer,
} from "@/lib/db/influencers";
import { normalizeWhatsapp } from "@/lib/partner/codes";
import {
  verifyPassword,
  createPartnerSessionToken,
  getPartnerSessionCookieOptions,
} from "@/lib/partner/auth";
import {
  getAttemptStore,
  checkLimit,
  recordFailure,
  clearKeys,
  clientIp,
  loginKeys,
  tooManyMessage,
  LOGIN_LIMIT,
} from "@/lib/auth/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // "email" may also hold a WhatsApp number: partners without email log in with it.
    const login = String(body.login ?? body.email ?? "").trim();
    const password = body.password;

    if (!login || !password) {
      return NextResponse.json({ error: "Email or WhatsApp number and password required" }, { status: 400 });
    }

    // Rate limit: 10 failed tries per 15 minutes, per IP and per account.
    const store = await getAttemptStore();
    const keys = loginKeys("partner", clientIp(request.headers), login.includes("@") ? login : normalizeWhatsapp(login) || login);
    const check = await checkLimit(store, keys, LOGIN_LIMIT);
    if (!check.allowed) {
      return NextResponse.json(
        { error: tooManyMessage(check.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } }
      );
    }

    let influencer: Influencer | null = null;
    if (login.includes("@")) {
      const found = await getInfluencerByEmail(login);
      if (found?.password_hash && (await verifyPassword(password, found.password_hash))) influencer = found;
    } else {
      const whatsapp = normalizeWhatsapp(login);
      // A number is unique per hotel, so it can match one partner per hotel: take the one
      // whose password matches.
      for (const found of whatsapp ? await getInfluencersByWhatsapp(whatsapp) : []) {
        if (found.password_hash && (await verifyPassword(password, found.password_hash))) {
          influencer = found;
          break;
        }
      }
    }
    if (!influencer) {
      await recordFailure(store, keys);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await clearKeys(store, [keys[1]]);

    const hotel = await getHotelById(influencer.hotel_id);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 500 });
    }

    const token = await createPartnerSessionToken({
      influencerId: influencer.id,
      hotelId: influencer.hotel_id,
      hotelSlug: hotel.slug,
      email: influencer.email ?? influencer.whatsapp ?? "",
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
