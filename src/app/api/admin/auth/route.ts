import { NextRequest, NextResponse } from "next/server";
import { getAdminUserByEmail, getHotelById } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "@/lib/admin/auth";
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
import { billingView, sessionBillingClaim, type HotelBilling } from "@/lib/billing/access";

// bcrypt hash of a random throwaway password: unknown emails still pay the
// bcrypt cost, so response time doesn't reveal which emails exist.
const DUMMY_HASH = "$2b$10$.7muuid6tI028qOU4sXTXexD/9ufg/ptzRxTC6DjIj41I4vj1EUXm";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Rate limit: 10 failed tries per 15 minutes, per IP and per account.
    const store = await getAttemptStore();
    const keys = loginKeys("admin", clientIp(request.headers), String(email));
    const check = await checkLimit(store, keys, LOGIN_LIMIT);
    if (!check.allowed) {
      return NextResponse.json(
        { error: tooManyMessage(check.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(check.retryAfterSec) } }
      );
    }

    const user = await getAdminUserByEmail(String(email));
    const valid = await verifyPassword(String(password), user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      await recordFailure(store, keys);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await clearKeys(store, [keys[1]]);

    const hotel = await getHotelById(user.hotel_id);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 500 });
    }

    // L2: a hotel that signed up but has no card (or whose plan ended) gets a session that only
    // opens the sign-up steps. Hotels without billing columns or status (Aracuya) are never blocked.
    const view = billingView(hotel as HotelBilling);
    const blocked = sessionBillingClaim(view);
    const token = await createSessionToken({
      userId: user.id,
      hotelId: user.hotel_id,
      email: user.email,
      hotelName: hotel.name,
      role: user.role,
      ...(blocked ? { billing: blocked } : {}),
    });

    const { name, options } = getSessionCookieOptions();
    const response = NextResponse.json({ success: true, ...(blocked ? { next: "/signup" } : {}) });
    response.cookies.set(name, token, options);
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
