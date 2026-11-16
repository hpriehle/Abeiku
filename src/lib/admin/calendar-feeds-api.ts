// Shared parts of /api/admin/calendar-feeds (list, add) and /api/admin/calendar-feeds/[id]
// (change, remove). Feeds live in hotel_calendar_feeds (docs/l2-feeds/calendar-feeds.sql).

import { NextResponse } from "next/server";
import { getHotelById, getHotelRooms } from "@/lib/db";
import { isMissingSchema } from "@/lib/db/hotel-feeds";
import { feedConfigFromEnv, SYNC_HOTEL_SLUG } from "@/lib/bookings/feeds";
import { icalSourceForUrl } from "@/lib/bookings/calendar-sync";
import { FEED_KIND_LABELS, feedDisplay, type FeedKind, type HotelFeed } from "@/lib/bookings/hotel-feeds";
import { serviceAccountEmail } from "@/lib/bookings/google-lister";

export const NOT_SET_UP = "Calendar links can't be changed yet. Please try again later.";
export const MANAGED = "Abeiku looks after this hotel's calendars. Email us to change them.";

export function notSetUpResponse() {
  return NextResponse.json({ error: NOT_SET_UP, notSetUp: true }, { status: 503 });
}

export function failResponse(err: unknown, where: string) {
  if (isMissingSchema(err)) {
    console.error(`[calendar-feeds] ${where}: table missing, run docs/l2-feeds/calendar-feeds.sql`);
    return notSetUpResponse();
  }
  console.error(`[calendar-feeds] ${where}:`, (err as Error)?.message ?? err);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
}

export async function hotelContext(hotelId: string) {
  const [hotel, rooms] = await Promise.all([getHotelById(hotelId), getHotelRooms(hotelId)]);
  return {
    hotel,
    /** Aracuya's feeds come from env and are not edited here. */
    managed: hotel?.slug === SYNC_HOTEL_SLUG,
    rooms: rooms.map((r) => ({ slug: r.slug, name: r.name })),
  };
}

/** What the screen gets for one feed (no full iCal link: it holds a private token). */
export function feedView(f: HotelFeed, rooms: { slug: string; name: string }[]) {
  const room = f.room_slug ? rooms.find((r) => r.slug === f.room_slug) : null;
  return {
    id: f.id,
    kind: f.kind,
    label: FEED_KIND_LABELS[f.kind],
    display: feedDisplay(f),
    room: f.room_slug,
    roomName: f.room_slug ? (room?.name ?? null) : null,
    lastSyncedAt: f.last_synced_at,
    lastError: f.last_error,
    lastErrorAt: f.last_error_at,
    lastCount: f.last_count,
  };
}

/** Aracuya's env feeds, read-only, by site only. */
export function managedFeedViews() {
  const cfg = feedConfigFromEnv();
  const out: { kind: FeedKind; label: string }[] = [];
  if (cfg.google) out.push({ kind: "google_calendar", label: FEED_KIND_LABELS.google_calendar });
  for (const u of cfg.icalUrls) {
    const k = icalSourceForUrl(u);
    if (k) out.push({ kind: k, label: FEED_KIND_LABELS[k] });
  }
  return out;
}

export { serviceAccountEmail };
