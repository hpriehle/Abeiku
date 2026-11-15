// GET  /api/admin/calendar-feeds: this hotel's calendar links with last synced / last error.
// POST /api/admin/calendar-feeds: add one ({ type: "ical" | "google", value, room }). The link
// is checked (shape, then one read with a short timeout) before it is saved.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { insertHotelFeed, isMissingSchema, listHotelFeeds } from "@/lib/db/hotel-feeds";
import { validateFeedInput } from "@/lib/bookings/hotel-feeds";
import { googleListerFromEnv } from "@/lib/bookings/google-lister";
import {
  MANAGED,
  failResponse,
  feedView,
  hotelContext,
  managedFeedViews,
  notSetUpResponse,
  serviceAccountEmail,
} from "@/lib/admin/calendar-feeds-api";

export const dynamic = "force-dynamic";
const MAX_FEEDS = 20;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const ctx = await hotelContext(session.hotelId);
    if (!ctx.hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    const base = { rooms: ctx.rooms, shareWith: serviceAccountEmail() };
    if (ctx.managed) return NextResponse.json({ ...base, managed: true, managedFeeds: managedFeedViews(), feeds: [] });
    let feeds;
    try {
      feeds = await listHotelFeeds(session.hotelId);
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
      return NextResponse.json({ ...base, notSetUp: true, feeds: [] });
    }
    return NextResponse.json({ ...base, feeds: feeds.map((f) => feedView(f, ctx.rooms)) });
  } catch (err) {
    return failResponse(err, "list");
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (existing.length >= MAX_FEEDS) {
      return NextResponse.json({ error: `You can add up to ${MAX_FEEDS} calendars. Remove one first.` }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const checked = await validateFeedInput(body, {
      rooms: ctx.rooms.map((r) => r.slug),
      existing,
      listGoogle: googleListerFromEnv(process.env, { onePage: true }),
      today: new Date().toISOString().slice(0, 10),
    });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const saved = await insertHotelFeed({ hotel_id: session.hotelId, ...checked.value });
    return NextResponse.json({ feed: feedView(saved, ctx.rooms) });
  } catch (err) {
    return failResponse(err, "add");
  }
}
