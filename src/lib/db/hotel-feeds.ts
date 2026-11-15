// Supabase store for per-hotel calendar feeds. Needs docs/l2-feeds/calendar-feeds.sql;
// before it runs, every call throws a missing-table error that callers turn into
// "not set up yet" (the cron skips, the admin screen says so). Never a 500.

import { supabase } from "@/lib/supabase/client";
import type { FeedHotel, FeedSyncStore } from "@/lib/bookings/feed-sync";
import { signupLinksToFeeds, type FeedKind, type FeedStatus, type HotelFeed } from "@/lib/bookings/hotel-feeds";

const TABLE = "hotel_calendar_feeds";

/** Postgres / PostgREST codes for a table or column that doesn't exist yet. */
export function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = String((err as { message?: string })?.message ?? "");
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204" || /does not exist|could not find the table/i.test(msg);
}

function toFeed(r: Record<string, unknown>): HotelFeed {
  return {
    id: r.id as string,
    hotel_id: r.hotel_id as string,
    kind: r.kind as FeedKind,
    url: r.url as string,
    room_slug: (r.room_slug as string | null) ?? null,
    last_synced_at: (r.last_synced_at as string | null) ?? null,
    last_error: (r.last_error as string | null) ?? null,
    last_error_at: (r.last_error_at as string | null) ?? null,
    last_count: r.last_count == null ? null : Number(r.last_count),
  };
}

export async function listHotelFeeds(hotelId: string): Promise<HotelFeed[]> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("hotel_id", hotelId).order("created_at");
  if (error) throw error;
  return (data ?? []).map(toFeed);
}

export async function insertHotelFeed(row: { hotel_id: string; kind: FeedKind; url: string; room_slug: string | null }): Promise<HotelFeed> {
  const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();
  if (error) throw error;
  return toFeed(data);
}

export async function updateHotelFeed(
  hotelId: string,
  id: string,
  patch: Partial<{ kind: FeedKind; url: string; room_slug: string | null; last_error: string | null; last_error_at: string | null }>
): Promise<HotelFeed | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("hotel_id", hotelId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? toFeed(data) : null;
}

/**
 * Remove a feed. Its stays that are not over yet are marked cancelled without an email (the
 * hotel removed the link; nothing was cancelled by a guest). Past stays stay as history.
 * Returns false if there was no such feed.
 */
export async function deleteHotelFeed(hotelId: string, id: string, today: string): Promise<boolean> {
  const { data, error } = await supabase.from(TABLE).select("id").eq("id", id).eq("hotel_id", hotelId).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const now = new Date().toISOString();
  // With the C2 alert column: mark the cancellation as already told. Without it, just cancel.
  let res = await supabase
    .from("bookings")
    .update({ booking_status: "cancelled", alert_cancel_sent_at: now, updated_at: now })
    .eq("hotel_id", hotelId)
    .eq("feed_id", id)
    .neq("booking_status", "cancelled")
    .gte("check_out", today);
  if (res.error && isMissingSchema(res.error)) {
    res = await supabase
      .from("bookings")
      .update({ booking_status: "cancelled", updated_at: now })
      .eq("hotel_id", hotelId)
      .eq("feed_id", id)
      .neq("booking_status", "cancelled")
      .gte("check_out", today);
  }
  if (res.error) throw res.error;
  const del = await supabase.from(TABLE).delete().eq("id", id).eq("hotel_id", hotelId);
  if (del.error) throw del.error;
  return true;
}

export const supabaseFeedSyncStore: FeedSyncStore = {
  async listFeedHotels() {
    const { data, error } = await supabase.from(TABLE).select("*, hotels(*)").order("hotel_id").limit(5000);
    if (error) throw error;
    const byHotel = new Map<string, FeedHotel>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const h = r.hotels as Record<string, unknown> | null;
      if (!h) continue;
      const entry =
        byHotel.get(h.id as string) ??
        ({ id: h.id as string, slug: h.slug as string, hotel: h as FeedHotel["hotel"], feeds: [] } satisfies FeedHotel);
      entry.feeds.push(toFeed(r));
      byHotel.set(entry.id, entry);
    }
    return [...byHotel.values()];
  },

  async roomsOf(hotelId) {
    const { data, error } = await supabase.from("hotel_rooms").select("slug, total_rooms").eq("hotel_id", hotelId).eq("active", true);
    if (error) throw error;
    return (data ?? []).map((r) => ({ slug: r.slug as string, units: Number(r.total_rooms) || 1 }));
  },

  async recordStatus(feedId, s: FeedStatus) {
    const patch = s.ok
      ? { last_synced_at: s.at, last_count: s.count ?? null, last_error: null, last_error_at: null }
      : { last_error: s.error ?? "Could not read this calendar.", last_error_at: s.at };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", feedId);
    if (error) throw error;
  },
};

/**
 * After the sign-up calendar step: add its links as feeds and drop feeds whose link was in
 * the step's previous answer but not in the new one. Feeds added on Settings > Calendars are
 * left alone. Best effort: logs and returns if the feeds table doesn't exist yet (the SQL
 * copies hotels.calendar_links in when it runs).
 */
export async function syncSignupLinks(
  hotelId: string,
  before: Parameters<typeof signupLinksToFeeds>[0],
  after: Parameters<typeof signupLinksToFeeds>[0]
): Promise<void> {
  try {
    const existing = await listHotelFeeds(hotelId);
    const next = signupLinksToFeeds(after);
    const nextUrls = new Set(next.map((f) => f.url.toLowerCase()));
    for (const old of signupLinksToFeeds(before)) {
      if (nextUrls.has(old.url.toLowerCase())) continue;
      const row = existing.find((f) => f.url.toLowerCase() === old.url.toLowerCase());
      if (row) await deleteHotelFeed(hotelId, row.id, new Date().toISOString().slice(0, 10));
    }
    for (const f of next) {
      if (existing.some((e) => e.url.toLowerCase() === f.url.toLowerCase())) continue;
      await insertHotelFeed({ hotel_id: hotelId, kind: f.kind, url: f.url, room_slug: null });
    }
  } catch (err) {
    console.error(
      isMissingSchema(err) ? "[calendar-feeds] signup links kept in hotels.calendar_links only (run docs/l2-feeds/calendar-feeds.sql)" : "[calendar-feeds] signup links:",
      isMissingSchema(err) ? "" : ((err as Error)?.message ?? err)
    );
  }
}
