// Calendar sync: the hotel's Google booking calendar and its OTA iCal feeds
// (Airbnb, VRBO, Booking.com) → rows in the hotel `bookings` table.
//
// Rules (Aracuya: one listing of 3 identical rooms booked by count):
// - Google events whose summary starts with "HOLD" (unpaid website holds) are skipped.
// - Rooms: private extended property rooms=<n>, else the summary ("1 Room", "2 Rooms",
//   "Entire House" = all), else the whole house. iCal blocks are always the whole house.
// - Events the website created (private props source=aracuya-site + bookingId) are stored
//   under source aracuya_web / external_ref = bookingId: the same key the website's booking
//   report uses, so a web booking is one row however it arrives. Older web events without
//   props are matched to the aracuya_web row with the same dates + guest.
// - A row whose event is gone from a feed that was read successfully is marked cancelled
//   (never deleted). Only stays not yet over are checked, so feeds dropping past events
//   change nothing. A feed that fails to load cancels nothing.

import {
  listingFor,
  upsertHotelBooking,
  changedFields,
  fillMissing,
  type BookingSource,
  type HotelBookingPatch,
  type HotelBookingRow,
  type HotelBookingsStore,
  type NewHotelBooking,
} from "./hotel-bookings";
import { WEB_SOURCE } from "./web-ingest";

export type IcalSource = "airbnb" | "vrbo" | "booking_com";
export const ICAL_SOURCES: IcalSource[] = ["airbnb", "vrbo", "booking_com"];
export const SOURCE_LABELS: Record<BookingSource, string> = {
  aracuya_web: "Website",
  google_calendar: "Google Calendar",
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking_com: "Booking.com",
  manual: "Manual",
  whatsapp: "WhatsApp",
};

/** Minimal Google Calendar event shape (calendar_v3.Schema$Event is assignable to it). */
export interface GoogleEventLike {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}

/** One booking as a feed describes it, before it is matched to a row. */
export interface FeedBooking {
  source: BookingSource;
  external_ref: string;
  check_in: string;
  check_out: string;
  rooms_count: number;
  guest_name: string;
  phone: string | null;
  guest_email: string | null;
  guests: number | null;
  total_price: number | null;
  payment_status: "unpaid" | "paid" | null;
  payment_provider: string | null;
  calendar_event_id: string | null;
  /** Guest name parsed from an "Aracuya · <rooms> · <guest> (paid …)" summary without props. */
  webGuestFromSummary?: string;
  /** Per-hotel feed (hotel_calendar_feeds.id) this came from; unset for Aracuya's env feeds. */
  feed_id?: string;
  /** Room it blocks when the feed is tied to one room (else the hotel's whole-property slug). */
  room_slug?: string;
}

// ── Dates ────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Nights a timed event occupies: every night whose ending midnight (UTC = Ghana time)
 * falls inside (start, end]. A 00:00–00:00 entry covers that one night (how staff enter
 * bookings by hand); a 10:00–12:00 slot covers none. Same rule as aracuya.com's availability.
 */
function timedRangeToNights(startIso: string, endIso: string): { check_in: string; check_out: string } | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const DAY = 86_400_000;
  const firstMidnight = Math.floor(start / DAY) * DAY + DAY;
  const lastMidnight = Math.floor(end / DAY) * DAY;
  if (firstMidnight > lastMidnight) return null;
  const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { check_in: addDays(toDate(firstMidnight), -1), check_out: toDate(lastMidnight) };
}

function eventNights(e: GoogleEventLike): { check_in: string; check_out: string } | null {
  let range: { check_in: string; check_out: string } | null = null;
  if (e.start?.date && e.end?.date && DATE_RE.test(e.start.date) && DATE_RE.test(e.end.date)) {
    range = { check_in: e.start.date, check_out: e.end.date };
  } else if (e.start?.dateTime && e.end?.dateTime) {
    range = timedRangeToNights(e.start.dateTime, e.end.dateTime);
  }
  return range && range.check_out > range.check_in ? range : null;
}

// ── Google Calendar ──────────────────────────────────────────────────────

/** Rooms an event takes: rooms=<n> property, else "N Room(s)" or "N Bedroom(s)" / "Entire House" in the summary, else all. */
export function parseRoomsCount(
  summary: string | null | undefined,
  privateProps: Record<string, string> | null | undefined,
  totalRooms: number
): number {
  const fromProps = Number.parseInt(privateProps?.rooms ?? "", 10);
  if (fromProps >= 1) return Math.min(fromProps, totalRooms);
  if (/\bentire\s+house\b/i.test(summary ?? "")) return totalRooms;
  const m = (summary ?? "").match(/\b([1-9])\s*(?:bed)?rooms?\b/i);
  if (m) return Math.min(Number(m[1]), totalRooms);
  return totalRooms;
}

const WEB_SUMMARY_RE = /^Aracuya\s*·\s*[^·]+·\s*(.+?)\s*\((?:paid|awaiting)[^)]*\)\s*$/i;

function intOrNull(v: string | undefined): number | null {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A Google Calendar event as a booking, or null if it isn't one (HOLD, cancelled, no nights). */
export function googleEventToBooking(e: GoogleEventLike, totalRooms: number): FeedBooking | null {
  if (!e.id || e.status === "cancelled") return null;
  const summary = (e.summary ?? "").trim();
  const props = e.extendedProperties?.private ?? null;
  if (/^hold\b/i.test(summary) || props?.status === "hold") return null;
  const nights = eventNights(e);
  if (!nights) return null;

  const rooms_count = parseRoomsCount(summary, props, totalRooms);

  // Created by the website: same key as the website's booking report.
  if (props?.source === "aracuya-site" && props.bookingId) {
    const total = Number(props.totalGhs);
    return {
      source: WEB_SOURCE,
      external_ref: props.bookingId,
      ...nights,
      rooms_count,
      guest_name: props.guestName?.trim() || summary || "Guest",
      phone: props.guestPhone?.trim() || null,
      guest_email: props.guestEmail?.trim() || null,
      guests: intOrNull(props.guests),
      total_price: Number.isFinite(total) && total > 0 ? total : null,
      payment_status: props.status === "confirmed" ? "paid" : null,
      payment_provider: props.provider || null,
      calendar_event_id: e.id,
    };
  }

  const web = WEB_SUMMARY_RE.exec(summary);
  return {
    source: "google_calendar",
    external_ref: e.id,
    ...nights,
    rooms_count,
    guest_name: (web ? web[1] : summary).slice(0, 200) || "Calendar booking",
    phone: null,
    guest_email: null,
    guests: null,
    total_price: null,
    payment_status: null,
    payment_provider: null,
    calendar_event_id: e.id,
    ...(web ? { webGuestFromSummary: web[1] } : {}),
  };
}

// ── iCal (Airbnb, VRBO, Booking.com) ─────────────────────────────────────

/** Which OTA an iCal export link belongs to, from its host; null if unknown. */
export function icalSourceForUrl(url: string): IcalSource | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "airbnb.com" || host.endsWith(".airbnb.com")) return "airbnb";
  if (host === "vrbo.com" || host.endsWith(".vrbo.com") || host.endsWith(".homeaway.com")) return "vrbo";
  if (host === "booking.com" || host.endsWith(".booking.com")) return "booking_com";
  return null;
}

function icalDate(v: string): { date?: string; dateTime?: string } {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return {};
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  return m[4] ? { dateTime: `${date}T${m[4]}:${m[5]}:${m[6]}Z` } : { date };
}

function icalText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Guest label for an OTA block: VRBO's "Reserved - Ama" → "Ama", else "<OTA> · <summary>". */
function icalGuestName(source: IcalSource, summary: string): string {
  const named = /^reserved\s*-\s*(.+)$/i.exec(summary);
  if (named) return named[1].slice(0, 200);
  return summary ? `${SOURCE_LABELS[source]} · ${summary}`.slice(0, 200) : SOURCE_LABELS[source];
}

/** Every VEVENT in an iCal feed as a whole-house booking keyed by its UID. */
export function parseIcalBookings(ics: string, source: IcalSource, totalRooms: number): FeedBooking[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: FeedBooking[] = [];
  let ev: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      ev = {};
    } else if (line === "END:VEVENT") {
      if (ev?.UID && ev.DTSTART && ev.DTEND && !/^cancel/i.test(ev.STATUS ?? "")) {
        const nights = eventNights({ start: icalDate(ev.DTSTART), end: icalDate(ev.DTEND) });
        if (nights) {
          const summary = icalText(ev.SUMMARY ?? "");
          out.push({
            source,
            external_ref: ev.UID,
            ...nights,
            rooms_count: totalRooms,
            guest_name: icalGuestName(source, summary),
            phone: null,
            guest_email: null,
            guests: null,
            total_price: null,
            payment_status: null,
            payment_provider: source,
            calendar_event_id: null,
          });
        }
      }
      ev = null;
    } else if (ev) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        const key = line.slice(0, colon).split(";")[0].toUpperCase();
        if (!(key in ev)) ev[key] = line.slice(colon + 1);
      }
    }
  }
  return out;
}

// ── Reconcile ────────────────────────────────────────────────────────────

export interface FeedResult {
  source: "google_calendar" | IcalSource;
  /** Set for a per-hotel feed: rows are then judged by this feed alone, not by source. */
  feedId?: string;
  /** null when the feed failed to load: then nothing from it is cancelled. */
  bookings: FeedBooking[] | null;
}

export interface SyncSummary {
  inserted: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  matchedWeb: number;
  failedFeeds: string[];
}

const sameGuest = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function newRow(hotelId: string, roomSlug: string, b: FeedBooking): NewHotelBooking {
  return {
    hotel_id: hotelId,
    source: b.source,
    external_ref: b.external_ref,
    guest_name: b.guest_name,
    phone: b.phone,
    guest_email: b.guest_email,
    guests: b.guests,
    room_slug: b.room_slug ?? roomSlug,
    rooms_count: b.rooms_count,
    check_in: b.check_in,
    check_out: b.check_out,
    total_price: b.total_price ?? 0,
    currency: "GHS",
    payment_status: b.payment_status ?? "unpaid",
    payment_provider: b.payment_provider,
    booking_status: "confirmed",
    calendar_event_id: b.calendar_event_id,
    ref_code: null,
    paid_at: null,
    ...(b.feed_id ? { feed_id: b.feed_id } : {}),
  };
}

/** What the feed says about a row it already has (dates, rooms, guest label; reappearing → confirmed). */
function feedPatch(row: HotelBookingRow, b: FeedBooking): HotelBookingPatch {
  if (b.source === WEB_SOURCE) {
    // The website's own report is the better record: only add the calendar link and gaps.
    // A cancelled web booking stays cancelled.
    return {
      calendar_event_id: b.calendar_event_id ?? undefined,
      ...fillMissing(row, {
        phone: b.phone,
        guest_email: b.guest_email,
        guests: b.guests,
        payment_provider: b.payment_provider,
      }),
      ...(row.total_price ? {} : b.total_price ? { total_price: b.total_price, currency: "GHS" } : {}),
      ...(b.payment_status === "paid" && row.payment_status === "unpaid" ? { payment_status: "paid" as const } : {}),
    };
  }
  return {
    check_in: b.check_in,
    check_out: b.check_out,
    rooms_count: b.rooms_count,
    guest_name: b.guest_name,
    ...(row.booking_status === "cancelled" ? { booking_status: "confirmed" as const } : {}),
    // Per-hotel feeds: the row follows its feed (a re-added link, or a changed room).
    ...(b.feed_id ? { feed_id: b.feed_id, room_slug: b.room_slug } : {}),
  };
}

/**
 * Bring the hotel's bookings in line with the feeds. `today` (YYYY-MM-DD): stays that
 * ended before it are never cancelled for being missing.
 */
export async function syncHotelBookings(input: {
  store: HotelBookingsStore;
  hotelId: string;
  hotelSlug: string;
  feeds: FeedResult[];
  today: string;
}): Promise<SyncSummary> {
  const { store, hotelId, feeds, today } = input;
  const { roomSlug } = listingFor(input.hotelSlug);
  const summary: SyncSummary = { inserted: 0, updated: 0, cancelled: 0, unchanged: 0, matchedWeb: 0, failedFeeds: [] };

  const sources: BookingSource[] = [WEB_SOURCE, "google_calendar", ...ICAL_SOURCES];
  const rows = await store.listBySources(hotelId, sources);
  const key = (source: string, ref: string) => `${source}\u0000${ref}`;
  const byKey = new Map(rows.map((r) => [key(r.source, r.external_ref), r]));
  const seen = new Set<string>(); // row ids present in a feed this run

  const write = async (row: HotelBookingRow, patch: HotelBookingPatch) => {
    const changed = changedFields(row, patch);
    if (!Object.keys(changed).length) {
      summary.unchanged++;
    } else {
      await store.update(row.id, changed);
      Object.assign(row, changed);
      summary.updated++;
    }
  };

  for (const feed of feeds) {
    if (!feed.bookings) {
      summary.failedFeeds.push(feed.source);
      continue;
    }
    for (const b of feed.bookings) {
      let row = byKey.get(key(b.source, b.external_ref));

      if (!row && b.source === "google_calendar") {
        // A website booking's calendar event without props: the reported row it was linked to
        // before, else the reported row with the same dates + guest.
        row =
          rows.find((r) => r.source === WEB_SOURCE && r.calendar_event_id === b.calendar_event_id) ??
          (b.webGuestFromSummary
            ? rows.find(
                (r) =>
                  r.source === WEB_SOURCE &&
                  !seen.has(r.id) &&
                  r.check_in === b.check_in &&
                  r.check_out === b.check_out &&
                  sameGuest(r.guest_name, b.webGuestFromSummary!)
              )
            : undefined);
        if (row) {
          summary.matchedWeb++;
          seen.add(row.id);
          await write(row, { calendar_event_id: b.calendar_event_id ?? undefined });
          continue;
        }
      }

      if (!row && b.source !== WEB_SOURCE && b.source !== "google_calendar") {
        // OTA feeds may re-issue UIDs: reuse an unseen live row of the same source and dates.
        row = rows.find(
          (r) =>
            r.source === b.source &&
            (r.feed_id ?? null) === (b.feed_id ?? null) &&
            !seen.has(r.id) &&
            r.booking_status !== "cancelled" &&
            r.check_in === b.check_in &&
            r.check_out === b.check_out
        );
        if (row) {
          byKey.delete(key(row.source, row.external_ref));
          await write(row, { external_ref: b.external_ref });
          byKey.set(key(row.source, row.external_ref), row);
        }
      }

      if (row) {
        if (b.source === WEB_SOURCE) summary.matchedWeb++;
        seen.add(row.id);
        await write(row, feedPatch(row, b));
        continue;
      }

      // New: insert (or, if someone else just inserted the key, update it).
      const saved = await upsertHotelBooking(store, newRow(hotelId, roomSlug, b), (existing) => feedPatch(existing, b));
      summary.inserted++;
      rows.push(saved);
      byKey.set(key(saved.source, saved.external_ref), saved);
      seen.add(saved.id);
    }
  }

  // Gone from a feed that loaded → cancelled (stays not yet over only). Rows of a per-hotel
  // feed are judged by that feed; other rows by source (Aracuya's env feeds).
  const loaded = new Set(feeds.filter((f) => f.bookings && !f.feedId).map((f) => f.source));
  const loadedFeedIds = new Set(feeds.filter((f) => f.bookings && f.feedId).map((f) => f.feedId!));
  for (const row of rows) {
    if (seen.has(row.id) || row.booking_status === "cancelled" || row.check_out < today) continue;
    const fromLoadedFeed = row.feed_id
      ? loadedFeedIds.has(row.feed_id)
      : row.source === WEB_SOURCE
        ? // A website booking is only judged by the calendar once the sync has linked its event.
          loaded.has("google_calendar") && Boolean(row.calendar_event_id)
        : loaded.has(row.source as FeedResult["source"]);
    if (!fromLoadedFeed) continue;
    await store.update(row.id, { booking_status: "cancelled" });
    row.booking_status = "cancelled";
    summary.cancelled++;
  }

  return summary;
}
