import { NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getAllHotelEarnings } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "platform_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const earnings = await getAllHotelEarnings();
    return NextResponse.json({ earnings });
  } catch (error) {
    console.error("Platform earnings error:", error);
    return NextResponse.json({ error: "Failed to fetch earnings" }, { status: 500 });
  }
}
