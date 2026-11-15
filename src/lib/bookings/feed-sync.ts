// Booking sync for every hotel with its own calendar feeds (hotel_calendar_feeds).
// Runs inside /api/cron/booking-sync next to Aracuya's env-configured sync, which is unchanged.
//
// Limits so one bad feed can't stall the rest: each feed has its own short timeout and size
// cap, at most FEED_CONCURRENCY are read at once, at most MAX_FEEDS_PER_RUN per run, and no
// new feed is started after `readDeadline` nor a new hotel saved after `writeDeadline`.
// Feeds not reached keep their old last_synced_at, so they go first next run.

import { syncHotelBookings, type FeedResult } from "./calendar-sync";
import type { HotelBookingsStore } from "./hotel-bookings";
import {
  alertFeedKey,
  limitedMap,
  readHotelFeed,
  shouldSyncHotel,
  type FeedStatus,
  type HotelFeed,
  type ReadContext,
} from "./hotel-feeds";
import type { HotelBilling } from "@/lib/billing/access";

export const FEED_CONCURRENCY = 6;
export const MAX_FEEDS_PER_RUN = 60;

export interface FeedHotel {
  id: string;
  slug: string;
  hotel: HotelBilling & { active?: boolean | null; room_count?: number | null };
  feeds: HotelFeed[];
}

export interface FeedSyncStore {
  /** Hotels that have at least one feed, with their feeds. Throws if the feeds table is missing. */
  listFeedHotels(): Promise<FeedHotel[]>;
  /** Active rooms of a hotel: slug and how many units it has. */
  roomsOf(hotelId: string): Promise<{ slug: string; units: number }[]>;
  recordStatus(feedId: string, status: FeedStatus): Promise<void>;
}

export interface AlertInput {
  hotelId: string;
  loadedFeeds: string[];
  syncedBefore: Set<string> | null;
}

export interface FeedSyncSummary {
  hotels: number;
  skippedHotels: number;
  feedsOk: number;
  feedsFailed: number;
  feedsNotReached: number;
  inserted: number;
  updated: number;
  cancelled: number;
  failedHotels: string[];
  /** For the alert step: one entry per hotel whose bookings were saved this run. */
  alertInputs: AlertInput[];
  notSetUp?: true;
}

const oldestFirst = (f: HotelFeed) => (f.last_synced_at ? Date.parse(f.last_synced_at) : 0);

export async function syncFeedHotels(input: {
  store: FeedSyncStore;
  bookings: HotelBookingsStore;
  syncedFeeds: (hotelId: string) => Promise<Set<string> | null>;
  read: Omit<ReadContext, "totalRooms" | "wholeSlug" | "rooms">;
  /** Aracuya (synced from env). */
  excludeHotelIds: string[];
  readDeadline: number;
  writeDeadline: number;
  now?: () => number;
  maxFeeds?: number;
}): Promise<FeedSyncSummary> {
  const now = input.now ?? Date.now;
  const out: FeedSyncSummary = {
    hotels: 0,
    skippedHotels: 0,
    feedsOk: 0,
    feedsFailed: 0,
    feedsNotReached: 0,
    inserted: 0,
    updated: 0,
    cancelled: 0,
    failedHotels: [],
    alertInputs: [],
  };

  let all: FeedHotel[];
  try {
    all = await input.store.listFeedHotels();
  } catch (err) {
    // Before docs/l2-feeds/calendar-feeds.sql has run: nothing to do.
    console.error("[booking-sync] hotel feeds not available:", (err as Error)?.message ?? err);
    return { ...out, notSetUp: true };
  }

  const hotels = all.filter((h) => {
    if (input.excludeHotelIds.includes(h.id) || !h.feeds.length) return false;
    if (!shouldSyncHotel(h.hotel)) {
      out.skippedHotels++;
      return false;
    }
    return true;
  });

  // Oldest feeds first, capped per run.
  const queue = hotels
    .flatMap((h) => h.feeds.map((f) => ({ h, f })))
    .sort((a, b) => oldestFirst(a.f) - oldestFirst(b.f));
  const max = input.maxFeeds ?? MAX_FEEDS_PER_RUN;
  out.feedsNotReached += Math.max(0, queue.length - max);
  const work = queue.slice(0, max);

  // Rooms per hotel (for room-tied feeds and whole-property blocks).
  const ctxByHotel = new Map<string, ReadContext>();
  for (const h of new Set(work.map((w) => w.h))) {
    let rooms: { slug: string; units: number }[] = [];
    try {
      rooms = await input.store.roomsOf(h.id);
    } catch (err) {
      console.error(`[booking-sync] rooms of ${h.slug}:`, (err as Error)?.message ?? err);
    }
    const sum = rooms.reduce((s, r) => s + Math.max(1, r.units || 1), 0);
    ctxByHotel.set(h.id, {
      ...input.read,
      totalRooms: Math.max(1, sum || h.hotel.room_count || 1),
      wholeSlug: "main",
      rooms: new Map(rooms.map((r) => [r.slug, Math.max(1, r.units || 1)])),
    });
  }

  const reads = await limitedMap(work, FEED_CONCURRENCY, input.readDeadline, (w) => readHotelFeed(w.f, ctxByHotel.get(w.h.id)!), now);

  // Save per hotel, one at a time.
  for (const h of hotels) {
    const mine = work
      .map((w, i) => ({ ...w, read: reads[i] }))
      .filter((w) => w.h.id === h.id && w.read !== undefined) as { h: FeedHotel; f: HotelFeed; read: { result: FeedResult; status: FeedStatus } }[];
    out.feedsNotReached += work.filter((w, i) => w.h.id === h.id && reads[i] === undefined).length;
    if (!mine.length) continue;
    if (now() >= input.writeDeadline) {
      out.feedsNotReached += mine.length;
      continue;
    }

    const record = (feedId: string, s: FeedStatus) =>
      input.store.recordStatus(feedId, s).catch((err) => console.error("[booking-sync] feed status not saved:", (err as Error)?.message ?? err));

    // Failed feeds: record the error now; their bookings are left as they are.
    for (const m of mine.filter((m) => !m.read.status.ok)) {
      out.feedsFailed++;
      await record(m.f.id, m.read.status);
    }
    const loaded = mine.filter((m) => m.read.status.ok);
    if (!loaded.length) continue;

    try {
      const syncedBefore = await input.syncedFeeds(h.id);
      const s = await syncHotelBookings({
        store: input.bookings,
        hotelId: h.id,
        hotelSlug: h.slug,
        feeds: loaded.map((m) => m.read.result),
        today: input.read.today,
      });
      out.hotels++;
      out.inserted += s.inserted;
      out.updated += s.updated;
      out.cancelled += s.cancelled;
      for (const m of loaded) {
        out.feedsOk++;
        await record(m.f.id, m.read.status);
      }
      out.alertInputs.push({ hotelId: h.id, loadedFeeds: loaded.map((m) => alertFeedKey(m.f.id)), syncedBefore });
    } catch (err) {
      console.error(`[booking-sync] saving ${h.slug} failed:`, (err as Error)?.message ?? err);
      out.failedHotels.push(h.slug);
      for (const m of loaded) {
        out.feedsFailed++;
        await record(m.f.id, { ok: false, at: m.read.status.at, error: "We read the calendar but could not save the bookings. We will try again." });
      }
    }
  }
  return out;
}
