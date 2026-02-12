import { NextRequest, NextResponse } from "next/server";
import { getAdminUserByEmail, getHotelById } from "@/lib/db";
import {
  verifyPassword,
  createSessionToken,
  getSessionCookieOptions,
  COOKIE_NAME,
} from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await getAdminUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const hotel = await getHotelById(user.hotel_id);
    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 500 });
    }

    const token = await createSessionToken({
      userId: user.id,
      hotelId: user.hotel_id,
      email: user.email,
      hotelName: hotel.name,
      role: user.role,
    });

    const { name, options } = getSessionCookieOptions();
    const response = NextResponse.json({ success: true });
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
