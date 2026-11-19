// Per-hotel calendar feeds (docs/l2-feeds/calendar-feeds.sql): the Airbnb / Booking.com / VRBO
// iCal links and Google calendar IDs a hotel enters at sign-up or on Settings > Calendars.
// Aracuya's feeds stay in env (./feeds.ts); this covers every other hotel.
//
// Each feed blocks either one room (room_slug) or the whole property (room_slug null).
// iCal links carry private tokens: only their host is ever logged or shown in errors.

import { billingView, type HotelBilling } from "@/lib/billing/access";
import {
  googleEventToBooking,
  icalSourceForUrl,
  parseIcalBookings,
  type FeedBooking,
  type FeedResult,
  type GoogleEventLike,
  type IcalSource,
} from "./calendar-sync";

export type FeedKind = IcalSource | "google_calendar";
export const FEED_KINDS: FeedKind[] = ["airbnb", "booking_com", "vrbo", "google_calendar"];

export const FEED_KIND_LABELS: Record<FeedKind, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  vrbo: "VRBO",
  google_calendar: "Google calendar",
};

export interface HotelFeed {
  id: string;
  hotel_id: string;
  kind: FeedKind;
  /** iCal link, or the Google calendar ID. */
  url: string;
  /** null = whole property. */
  room_slug: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_count: number | null;
}

/** Status the sync writes back after each try. */
export interface FeedStatus {
  ok: boolean;
  at: string;
  count?: number;
  error?: string;
}

/** Key in booking_alert_feeds for a per-hotel feed (Aracuya's env feeds use the source name). */
export const alertFeedKey = (feedId: string) => `feed:${feedId}`;

// ── Who gets synced ──────────────────────────────────────────────────────

/**
 * Hotels on a live trial or paid plan (also past due, even locked, or cancelled but still inside the paid
 * time), and billing-exempt hotels. Not: no card yet, ended, or hotels outside billing.
 */
export function shouldSyncHotel(h: HotelBilling & { active?: boolean | null }): boolean {
  if (h.active === false) return false;
  const v = billingView(h);
  if (v.exempt) return true;
  return v.status !== null && (v.access === "full" || v.access === "locked");
}

// ── Validation ───────────────────────────────────────────────────────────

const GOOGLE_ID_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Shape only (no network): https, a known booking site, not too long. */
export function parseIcalLink(raw: unknown): Checked<{ url: string; kind: IcalSource }> {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: false, error: "Paste the calendar link first." };
  if (s.length > 1000) return { ok: false, error: "That link is too long. Copy only the calendar link." };
  let u: URL;
  try {
    u = new URL(s.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, error: "That is not a web address. Copy the full link that starts with https." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "The link must start with https." };
  const kind = icalSourceForUrl(u.toString());
  if (!kind) {
    return { ok: false, error: "We can read calendar links from Airbnb, Booking.com and VRBO. This link is from somewhere else." };
  }
  return { ok: true, value: { url: u.toString(), kind } };
}

/** A Google calendar ID looks like an email address (abc123@group.calendar.google.com or you@gmail.com). */
export function parseGoogleCalendarId(raw: unknown): Checked<string> {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: false, error: "Enter the calendar ID first." };
  if (s.length > 254 || !GOOGLE_ID_RE.test(s)) {
    return { ok: false, error: "The calendar ID looks like an email address, for example abc123@group.calendar.google.com." };
  }
  return { ok: true, value: s };
}

// ── Reading ──────────────────────────────────────────────────────────────

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const ICAL_TIMEOUT_MS = 8_000;
/** Bigger than any real listing feed (a few hundred KB at most). */
export const ICAL_MAX_BYTES = 3 * 1024 * 1024;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "invalid link";
  }
};

/** Reads at most `max` bytes; throws if the body is bigger. */
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw new FeedError("The calendar file is too big to be a booking calendar.");
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new FeedError("The calendar file is too big to be a booking calendar.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** An error whose message is fine to show the hotel (plain English, no link tokens). */
export class FeedError extends Error {}

/**
 * Fetch an iCal link once (short timeout, size cap) and return its text. Errors are FeedErrors
 * with a friendly message. Only Airbnb / Booking.com / VRBO hosts are fetched, also after redirects.
 */
export async function fetchIcal(
  url: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number } = {}
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  if (!icalSourceForUrl(url)) throw new FeedError("This link is not from Airbnb, Booking.com or VRBO.");
  let res: Response;
  try {
    res = await doFetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? ICAL_TIMEOUT_MS),
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new FeedError(`${hostOf(url)} took too long to answer. We will try again.`);
    }
    throw new FeedError(`We could not reach ${hostOf(url)}. Check the link.`);
  }
  if (res.url && !icalSourceForUrl(res.url)) {
    throw new FeedError("The link sent us to another website. Copy the calendar link again.");
  }
  if (res.status === 404 || res.status === 410) {
    throw new FeedError("This calendar link no longer works. Copy a fresh link from the booking site.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new FeedError("The booking site refused this link. Copy a fresh link from the booking site.");
  }
  if (!res.ok) throw new FeedError(`${hostOf(url)} answered with an error (${res.status}). We will try again.`);
  const text = await readCapped(res, opts.maxBytes ?? ICAL_MAX_BYTES);
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new FeedError("This link opens a web page, not a calendar. Copy the export or iCal link instead.");
  }
  return text;
}

const friendly = (err: unknown) =>
  err instanceof FeedError ? err.message : "We could not read this calendar. We will try again.";

export interface ReadContext {
  today: string;
  /** All rooms of the hotel (for whole-property blocks). */
  totalRooms: number;
  /** room_slug used for whole-property blocks. */
  wholeSlug: string;
  /** Rooms a feed may be tied to: slug → units of that room. */
  rooms: Map<string, number>;
  fetchImpl?: FetchLike;
  /** Per-feed limits (defaults ICAL_TIMEOUT_MS, ICAL_MAX_BYTES). */
  icalTimeoutMs?: number;
  icalMaxBytes?: number;
  /** Lists a shared Google calendar's events; null when the service account isn't set up. */
  listGoogle: ((calendarId: string, today: string) => Promise<GoogleEventLike[]>) | null;
}

/** Read one feed: its FeedResult (bookings null on failure) and the status to record. */
export async function readHotelFeed(feed: HotelFeed, ctx: ReadContext): Promise<{ result: FeedResult; status: FeedStatus }> {
  const at = new Date().toISOString();
  // A room that was removed since: count the feed as the whole property.
  const roomUnits = feed.room_slug ? ctx.rooms.get(feed.room_slug) : undefined;
  const roomSlug = roomUnits ? feed.room_slug! : ctx.wholeSlug;
  const tag = (b: FeedBooking, roomsCount: number): FeedBooking => ({
    ...b,
    rooms_count: roomsCount,
    feed_id: feed.id,
    room_slug: roomSlug,
  });
  try {
    let bookings: FeedBooking[];
    if (feed.kind === "google_calendar") {
      if (!ctx.listGoogle) throw new FeedError("Google calendar reading is not set up yet on Abeiku's side.");
      const events = await ctx.listGoogle(feed.url, ctx.today).catch((err) => {
        const code = Number((err as { code?: unknown })?.code ?? (err as { status?: unknown })?.status);
        if (code === 404 || code === 403) {
          throw new FeedError("We can't read this Google calendar. Share it with Abeiku (see the steps above).");
        }
        throw err;
      });
      const units = roomUnits ?? ctx.totalRooms;
      bookings = events
        .map((e) => googleEventToBooking(e, units))
        .filter((b): b is FeedBooking => b !== null)
        // Website-made events (Aracuya only) never come through here: keep them as calendar rows.
        .map((b) => tag({ ...b, source: "google_calendar", external_ref: b.calendar_event_id ?? b.external_ref }, b.rooms_count));
    } else {
      const text = await fetchIcal(feed.url, { fetchImpl: ctx.fetchImpl, timeoutMs: ctx.icalTimeoutMs, maxBytes: ctx.icalMaxBytes });
      bookings = parseIcalBookings(text, feed.kind, ctx.totalRooms).map((b) => tag(b, roomUnits ? 1 : ctx.totalRooms));
    }
    return { result: { source: feed.kind, feedId: feed.id, bookings }, status: { ok: true, at, count: bookings.length } };
  } catch (err) {
    if (!(err instanceof FeedError)) {
      console.error(`[booking-sync] feed ${feed.kind} (${feed.kind === "google_calendar" ? "google" : hostOf(feed.url)}) failed:`, (err as Error)?.message?.slice(0, 200));
    }
    return { result: { source: feed.kind, feedId: feed.id, bookings: null }, status: { ok: false, at, error: friendly(err) } };
  }
}

/** Run `fn` over `items`, at most `limit` at a time; items not started by `deadline` (ms epoch) are skipped. */
export async function limitedMap<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
  now: () => number = Date.now
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      if (now() >= deadline) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Saving a feed (Settings > Calendars) ─────────────────────────────────

export interface FeedInput {
  /** "ical" = an Airbnb / Booking.com / VRBO link; "google" = a Google calendar ID. */
  type: "ical" | "google";
  value: string;
  /** Room slug, or null / "" for the whole property. */
  room: string | null;
}

/**
 * Check a link before saving: its shape, the room, no duplicate, then one read with a short
 * timeout. Returns the row to save or a plain-English error.
 */
export async function validateFeedInput(
  body: Record<string, unknown>,
  ctx: {
    rooms: string[];
    existing: Pick<HotelFeed, "id" | "url">[];
    /** When editing: the feed being changed (it doesn't count as a duplicate). */
    editingId?: string;
    fetchImpl?: FetchLike;
    /** One-page Google read; null when the service account isn't set up. */
    listGoogle: ((calendarId: string, today: string) => Promise<GoogleEventLike[]>) | null;
    today: string;
  }
): Promise<Checked<{ kind: FeedKind; url: string; room_slug: string | null }>> {
  const type = body.type === "google" ? "google" : body.type === "ical" ? "ical" : null;
  if (!type) return { ok: false, error: "Choose a booking site link or a Google calendar." };
  const roomRaw = typeof body.room === "string" ? body.room.trim() : "";
  const room_slug = roomRaw && roomRaw !== "all" ? roomRaw : null;
  if (room_slug && !ctx.rooms.includes(room_slug)) return { ok: false, error: "Pick a room from the list." };

  let kind: FeedKind;
  let url: string;
  if (type === "ical") {
    const p = parseIcalLink(body.value);
    if (!p.ok) return p;
    ({ kind, url } = p.value);
  } else {
    const p = parseGoogleCalendarId(body.value);
    if (!p.ok) return p;
    kind = "google_calendar";
    url = p.value;
  }
  if (ctx.existing.some((f) => f.id !== ctx.editingId && f.url.toLowerCase() === url.toLowerCase())) {
    return { ok: false, error: "You have added this calendar already." };
  }

  try {
    if (kind === "google_calendar") {
      if (!ctx.listGoogle) return { ok: false, error: "Google calendars can't be connected yet. Please try again later." };
      await ctx.listGoogle(url, ctx.today).catch((err) => {
        const code = Number((err as { code?: unknown })?.code ?? (err as { status?: unknown })?.status);
        if (code === 404 || code === 403) {
          throw new FeedError("We can't read this calendar yet. Share it with Abeiku first (see the steps above), then try again.");
        }
        if ((err as Error)?.name === "TimeoutError" || /timeout/i.test((err as Error)?.message ?? "")) {
          throw new FeedError("Google took too long to answer. Please try again.");
        }
        throw err;
      });
    } else {
      await fetchIcal(url, { fetchImpl: ctx.fetchImpl, timeoutMs: 6_000 });
    }
  } catch (err) {
    return { ok: false, error: err instanceof FeedError ? err.message : "We could not read this calendar. Check the link and try again." };
  }
  return { ok: true, value: { kind, url, room_slug } };
}

/** What the screen shows for a link: the site and, for iCal, only the host (links hold private tokens). */
export function feedDisplay(f: Pick<HotelFeed, "kind" | "url">): string {
  if (f.kind === "google_calendar") return f.url;
  try {
    const u = new URL(f.url);
    return `${u.host}/…${u.pathname.slice(-6)}`;
  } catch {
    return "link";
  }
}

/** The sign-up step's links (hotels.calendar_links) as feed rows. Room: whole property. */
export function signupLinksToFeeds(
  links: { airbnb?: string | null; booking?: string | null; vrbo?: string | null; google?: string | null } | null | undefined
): { kind: FeedKind; url: string }[] {
  if (!links) return [];
  const out: { kind: FeedKind; url: string }[] = [];
  for (const [key, kind] of [["airbnb", "airbnb"], ["booking", "booking_com"], ["vrbo", "vrbo"]] as const) {
    const url = links[key];
    // A link from another host is still saved: the sync records "not from Airbnb, …" on it.
    if (url) out.push({ kind: icalSourceForUrl(url) ?? kind, url });
  }
  if (links.google) out.push({ kind: "google_calendar", url: links.google });
  return out;
}
