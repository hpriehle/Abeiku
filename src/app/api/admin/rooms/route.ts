import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelRooms, createHotelRoom, getNextRoomPosition } from "@/lib/db";
import { supabaseBillingStore } from "@/lib/billing/supabase-store";
import { checkRoomLimit, loadRoomLimit, roomLimitResponseBody, roomsAfterSave } from "@/lib/billing/room-limit";

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

    if (price !== undefined && price !== null && price !== "" && !(Number(price) > 0)) {
      return NextResponse.json({ error: "Enter a price per night greater than 0." }, { status: 400 });
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

    const resolvedRoomType = room_type || "standard";
    const resolvedTotal = resolvedRoomType === "individual" ? 1 : (total_rooms || 1);

    // The plan's room limit (small plan: 5). Exempt and non-billed hotels are not limited.
    const limit = await loadRoomLimit(session.hotelId, (id) => supabaseBillingStore.getHotel(id));
    const check = checkRoomLimit(
      limit,
      existingRooms,
      roomsAfterSave(existingRooms, { id: "new", room_type: resolvedRoomType, total_rooms: resolvedTotal, group_id: group_id || null })
    );
    if (!check.ok) return NextResponse.json(roomLimitResponseBody(check), { status: 403 });

    const position = await getNextRoomPosition(session.hotelId);

    const pricingTiers = price
      ? [{ rooms: 1, price: Number(price), label: resolvedRoomType === "group" ? "Entire House" : "1 Room" }]
      : [];

    const room = await createHotelRoom(session.hotelId, {
      slug,
      name,
      tagline: tagline || null,
      description: description || null,
      pricing_tiers: pricingTiers,
      total_rooms: resolvedTotal,
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
