import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelRooms, createHotelRoom, getNextRoomPosition } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rooms = await getHotelRooms(session.hotelId);
  return NextResponse.json({ rooms });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, bed_type, occupancy, size, price, total_rooms, amenities, description, tagline, room_type, group_id, images } = body;

    if (!name) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    // Generate unique slug
    const baseSlug = slugify(name);
    let slug = baseSlug;
    const existingRooms = await getHotelRooms(session.hotelId);
    const existingSlugs = new Set(existingRooms.map((r) => r.slug));
    let counter = 1;
    while (existingSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const position = await getNextRoomPosition(session.hotelId);

    const resolvedRoomType = room_type || "standard";
    const pricingTiers = price
      ? [{ rooms: 1, price: Number(price), label: resolvedRoomType === "group" ? "Entire House" : "1 Room" }]
      : [];

    const room = await createHotelRoom(session.hotelId, {
      slug,
      name,
      tagline: tagline || null,
      description: description || null,
      pricing_tiers: pricingTiers,
      total_rooms: resolvedRoomType === "individual" ? 1 : (total_rooms || 1),
      size: size || null,
      bed_type: bed_type || null,
      occupancy: occupancy || 2,
      amenities: amenities || [],
      airbnb_url: null,
      images: images || {},
      calendar_id: null,
      room_type: resolvedRoomType,
      group_id: group_id || null,
      position,
    });

    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error) {
    console.error("Create room error:", error);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
