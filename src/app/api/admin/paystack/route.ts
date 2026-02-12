import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  return NextResponse.json({
    connected: !!hotel.paystack_subaccount_code,
    subaccount_code: hotel.paystack_subaccount_code,
  });
}