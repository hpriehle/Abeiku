import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { updateHotelRoom, deleteHotelRoom } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, bed_type, occupancy, size, total_rooms, amenities, description, tagline, pricing_tiers, room_type, group_id, images } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (bed_type !== undefined) updates.bed_type = bed_type;
    if (occupancy !== undefined) updates.occupancy = occupancy;
    if (size !== undefined) updates.size = size;
    if (total_rooms !== undefined) updates.total_rooms = total_rooms;
    if (amenities !== undefined) updates.amenities = amenities;
    if (description !== undefined) updates.description = description;
    if (tagline !== undefined) updates.tagline = tagline;
    if (pricing_tiers !== undefined) updates.pricing_tiers = pricing_tiers;
    if (room_type !== undefined) updates.room_type = room_type;
    if (group_id !== undefined) updates.group_id = group_id;
    if (images !== undefined) updates.images = images;

    const room = await updateHotelRoom(session.hotelId, id, updates);
    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error("Update room error:", error);
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await deleteHotelRoom(session.hotelId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete room error:", error);
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
