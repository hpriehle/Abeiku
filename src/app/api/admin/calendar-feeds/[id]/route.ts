// PUT    /api/admin/calendar-feeds/:id: change the link and/or the room ({ type, value, room }).
//        With no value, only the room changes (no new check needed).
// DELETE /api/admin/calendar-feeds/:id: remove the link. Its stays not over yet leave the
//        calendar (marked cancelled, no email); past stays remain as history.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { deleteHotelFeed, isMissingSchema, listHotelFeeds, updateHotelFeed } from "@/lib/db/hotel-feeds";
import { validateFeedInput } from "@/lib/bookings/hotel-feeds";
import { googleListerFromEnv } from "@/lib/bookings/google-lister";
import { MANAGED, failResponse, feedView, hotelContext, notSetUpResponse } from "@/lib/admin/calendar-feeds-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "That calendar link was already removed." }, { status: 404 });

export async function PUT(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const ctx = await hotelContext(session.hotelId);
    if (!ctx.hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    if (ctx.managed) return NextResponse.json({ error: MANAGED }, { status: 409 });
    let existing;
    try {
      existing = await listHotelFeeds(session.hotelId);
    } catch (err) {
      if (isMissingSchema(err)) return notSetUpResponse();
      throw err;
    }
    const current = existing.find((f) => f.id === id);
    if (!current) return notFound();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const hasValue = typeof body.value === "string" && body.value.trim() !== "";
    let patch;
    if (hasValue) {
      const checked = await validateFeedInput(body, {
        rooms: ctx.rooms.map((r) => r.slug),
        existing,
        editingId: id,
        listGoogle: googleListerFromEnv(process.env, { onePage: true }),
        today: new Date().toISOString().slice(0, 10),
      });
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      // A new link: clear the old error; the next sync fills in the status.
      patch = { ...checked.value, last_error: null, last_error_at: null };
    } else {
      const room = typeof body.room === "string" ? body.room.trim() : "";
      const room_slug = room && room !== "all" ? room : null;
      if (room_slug && !ctx.rooms.some((r) => r.slug === room_slug)) {
        return NextResponse.json({ error: "Pick a room from the list." }, { status: 400 });
      }
      patch = { room_slug };
    }
    const saved = await updateHotelFeed(session.hotelId, id, patch);
    if (!saved) return notFound();
    return NextResponse.json({ feed: feedView(saved, ctx.rooms) });
  } catch (err) {
    return failResponse(err, "change");
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const ctx = await hotelContext(session.hotelId);
    if (!ctx.hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    if (ctx.managed) return NextResponse.json({ error: MANAGED }, { status: 409 });
    const ok = await deleteHotelFeed(session.hotelId, id, new Date().toISOString().slice(0, 10));
    if (!ok) return notFound();
    return NextResponse.json({ success: true });
  } catch (err) {
    return failResponse(err, "remove");
  }
}
