// GET /api/auth/google/callback — Handles OAuth callback from Google

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/calendar";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";
import { verifyOAuthState, OAUTH_STATE_COOKIE, stateCookieOptions } from "@/lib/calendar/oauth-state";

function settingsRedirect(query: string) {
  const res = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?${query}`);
  // One-time state: clear it whatever happened.
  res.cookies.set(OAUTH_STATE_COOKIE, "", stateCookieOptions(0));
  return res;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return settingsRedirect(`calendar=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return settingsRedirect("calendar=error&reason=no_code");
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/login`
    );
  }

  // CSRF: the code must come back with the state this browser was given.
  const state = request.nextUrl.searchParams.get("state");
  if (!verifyOAuthState(state, request.cookies.get(OAUTH_STATE_COOKIE)?.value, session.hotelId)) {
    return settingsRedirect("calendar=error&reason=state_mismatch");
  }

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) {
    return settingsRedirect("calendar=error&reason=hotel_not_found");
  }

  try {
    await hotelStorage.run({ hotelId: hotel.id, hotel }, () =>
      exchangeCodeForTokens(code)
    );

    return settingsRedirect("calendar=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return settingsRedirect("calendar=error&reason=token_exchange");
  }
}
