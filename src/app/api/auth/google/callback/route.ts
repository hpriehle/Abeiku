// GET /api/auth/google/callback — Handles OAuth callback from Google

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/calendar";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { hotelStorage } from "@/lib/hotel-context";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?calendar=error&reason=${error}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?calendar=error&reason=no_code`
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/login`
    );
  }

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?calendar=error&reason=hotel_not_found`
    );
  }

  try {
    await hotelStorage.run({ hotelId: hotel.id, hotel }, () =>
      exchangeCodeForTokens(code)
    );

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?calendar=connected`
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings?calendar=error&reason=token_exchange`
    );
  }
}
