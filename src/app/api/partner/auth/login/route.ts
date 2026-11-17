import { NextRequest, NextResponse } from "next/server";
import { getHotelById } from "@/lib/db";
import { markInfluencerLogin } from "@/lib/db/influencers";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { authenticate } from "@/lib/partner/accounts";
import { normalizeWhatsapp } from "@/lib/partner/codes";
import {
  verifyPassword,
  createPartnerSessionToken,
  getPartnerSessionCookieOptions,
  sessionPayloadFor,
} from "@/lib/partner/auth";
import { supabaseSignupStore } from "@/lib/db/partner-signup";
import { CONFIRM } from "@/lib/partner/p2-copy";
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

    // One account per person (P2); before the P2 SQL runs, one login per hotel row as before.
    const result = await authenticate(
      login,
      password,
      supabaseAccountStore,
      verifyPassword,
      supabaseSignupStore.confirmPending
    );
    if (!result) {
      await recordFailure(store, keys);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await clearKeys(store, [keys[1]]);
    if (result.unconfirmed) {
      // Signed up (P2 step 2) but the confirm link is not used yet: no session.
      return NextResponse.json(
        { error: CONFIRM.loginUnconfirmed, reason: "unconfirmed", email: result.account.email },
        { status: 403 }
      );
    }
    const { account, membership: influencer } = result;

    // No membership: a signed-up account no hotel has added yet.
    const hotel = influencer ? await getHotelById(influencer.hotel_id) : null;
    if (influencer && !hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 500 });
    }

    const token = await createPartnerSessionToken(sessionPayloadFor(account, influencer, hotel?.slug ?? ""));

    if (influencer) await markInfluencerLogin(influencer.id);
    if (account) await supabaseAccountStore.markAccountLogin(account.id);

    const { name, options } = getPartnerSessionCookieOptions();
    const response = NextResponse.json({ success: true });
    response.cookies.set(name, token, options);
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
