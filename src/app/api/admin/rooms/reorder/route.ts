import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { reorderHotelRooms } from "@/lib/db";

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { orderedIds } = await request.json();
    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "orderedIds must be an array" }, { status: 400 });
    }

    await reorderHotelRooms(session.hotelId, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder rooms error:", error);
    return NextResponse.json({ error: "Failed to reorder rooms" }, { status: 500 });
  }
}
