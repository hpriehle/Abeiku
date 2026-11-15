// Booking alerts to the hotel (never to guests): new booking, cancellation, and a daily
// "arriving tomorrow" digest, sent by email to the hotel's alert address (hotels.alert_email).
//
// They run off the `bookings` table, whatever wrote the row (website report, calendar /
// iCal sync, WhatsApp bot, admin). Each row remembers which alerts it has had
// (bookings.alert_new_sent_at / alert_cancel_sent_at), so a re-sync never sends twice:
// a row is *claimed* (column set where still NULL) before the email goes out, and released
// again if the email fails, so the next run retries it.
//
// No alerts for old bookings: the migration marks every existing row as alerted, and rows
// a feed brings in on its first successful sync (its backfill) are marked without an email.
//
// Until docs/c2-alerts/booking-alerts.sql has been run the columns don't exist: every
// entry point logs once and sends nothing (it never throws to its caller).
//
// Storage and the mailer are injected so this is tested without Supabase or Resend.

import { addDays, groupStays, nightsBetween, type CalendarBookingRow, type Stay } from "@/lib/bookings/calendar-view";
import type { BookingSource } from "@/lib/bookings/hotel-bookings";

export const ADMIN_CALENDAR_URL = "https://abeiku.com/admin/calendar";

/** Sources whose feeds carry no price. */
const NO_AMOUNT_SOURCES: BookingSource[] = ["google_calendar", "airbnb", "vrbo", "booking_com"];

export type AlertField = "alert_new_sent_at" | "alert_cancel_sent_at";

export interface AlertHotel {
  id: string;
  name: string;
  slug: string;
  alert_email: string;
  /** Rooms the hotel has (3 for Aracuya); used for "Entire House". */
  totalRooms: number;
}

export interface AlertStore {
  /** Hotels with an alert address. Throws a missing-schema error before the migration. */
  listAlertHotels(): Promise<AlertHotel[]>;
  /** Rows with no new-booking alert yet (any status). */
  listPendingNew(hotelId: string): Promise<(CalendarBookingRow & { calendar_event_id?: string | null; feed_id?: string | null })[]>;
  /** Cancelled rows with no cancellation alert yet, for stays not over by `today`. */
  listPendingCancel(hotelId: string, today: string): Promise<(CalendarBookingRow & { alert_new_sent_at: string | null })[]>;
  /** Rows by id (for an alert right after a known write). */
  getRows(hotelId: string, ids: string[]): Promise<(CalendarBookingRow & { alert_new_sent_at: string | null; alert_cancel_sent_at: string | null })[]>;
  /** Not-cancelled rows with check_in in [from, to]. */
  listByCheckIn(hotelId: string, from: string, to: string): Promise<CalendarBookingRow[]>;
  /** Sets `field` to now on those of `ids` where it is still NULL; returns the ids it set. */
  claim(ids: string[], field: AlertField): Promise<string[]>;
  /** Sets `field` back to NULL (the email failed; retry next run). */
  release(ids: string[], field: AlertField): Promise<void>;
  /** Feeds (google_calendar, airbnb, …) that have synced successfully before. */
  syncedFeeds(hotelId: string): Promise<Set<string>>;
  markFeedsSynced(hotelId: string, feeds: string[]): Promise<void>;
  /** Records the digest for (hotel, kind, date); false if it was already recorded. */
  claimDigest(hotelId: string, kind: string, forDate: string): Promise<boolean>;
  releaseDigest(hotelId: string, kind: string, forDate: string): Promise<void>;
}

export type Mailer = (msg: { to: string; subject: string; html: string; text: string }) => Promise<{ success: boolean; error?: string }>;

export interface AlertCounts {
  newSent: number;
  cancelSent: number;
  /** Marked without an email (backfill, or created and cancelled before any alert). */
  silenced: number;
  failed: number;
  skipped?: string;
}

/** More new stays than this in one run get a single summary email instead. */
export const MAX_SEPARATE_EMAILS = 10;

const emptyCounts = (): AlertCounts => ({ newSent: 0, cancelSent: 0, silenced: 0, failed: 0 });

// ── Missing schema (deploy before SQL) ───────────────────────────────────

/** Postgres undefined column/table, or PostgREST's "not in schema cache". */
export function isMissingSchema(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && ["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code)) return true;
  return /alert_email|alert_new_sent_at|alert_cancel_sent_at|booking_alert_/.test(e.message ?? "") &&
    /does not exist|could not find|schema cache/i.test(e.message ?? "");
}

/** Logs why alerts were skipped; returns "schema-missing" or "error". */
export function logSkip(where: string, err: unknown): string {
  if (isMissingSchema(err)) {
    console.warn(`[booking-alerts] ${where}: alert columns missing (run docs/c2-alerts/booking-alerts.sql); no alert sent`);
    return "schema-missing";
  }
  console.error(`[booking-alerts] ${where} failed:`, (err as Error)?.message ?? err);
  return "error";
}

// ── Formatting ───────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** "15–18 Nov", "30 Nov–2 Dec", "30 Dec 2026–2 Jan 2027". */
export function formatDateRange(checkIn: string, checkOut: string): string {
  const a = parts(checkIn);
  const b = parts(checkOut);
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]}–${b.d} ${MONTHS[b.m - 1]}`;
  return `${a.d}–${b.d} ${MONTHS[b.m - 1]}`;
}

/** "Mon 16 Nov 2026". */
export function formatDay(date: string): string {
  const { y, m, d } = parts(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function roomsText(rooms: number, totalRooms: number): string {
  const base = `${rooms} room${rooms === 1 ? "" : "s"}`;
  return totalRooms > 1 && rooms >= totalRooms ? `${base} (Entire House)` : base;
}

function money(amount: number, currency: string): string {
  const n = Number.isInteger(amount) ? amount.toLocaleString("en-US") : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency || "GHS"} ${n}`;
}

/** Amount for a stay, or "Not known" when the source doesn't share one. */
export function amountText(stay: Stay): string {
  const first = stay.rows[0];
  if (first.source && NO_AMOUNT_SOURCES.includes(first.source)) return `Not known (${stay.source.label} doesn't share it)`;
  const total = stay.rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0);
  if (!total) return "Not known";
  const paid = stay.rows.every((r) => r.payment_status === "paid") ? "paid" : stay.rows.some((r) => r.payment_status === "refunded") ? "refunded" : first.payment_status;
  return `${money(total, first.currency)} (${paid})`;
}

/** One line of text per header field; no CR/LF (subject header). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function guestName(stay: Stay): string {
  return oneLine(stay.guest_name) || "Guest";
}

function stayFields(stay: Stay, hotel: AlertHotel): [string, string][] {
  const guests = stay.rows.map((r) => r.guests).find((g) => g != null);
  return [
    ["Guest", guestName(stay)],
    ["Dates", `${formatDay(stay.check_in)} to ${formatDay(stay.check_out)}`],
    ["Nights", String(stay.nights)],
    ["Rooms", roomsText(stay.rooms_count, hotel.totalRooms)],
    ["Guests", guests != null ? String(guests) : "Not known"],
    ["Amount", amountText(stay)],
    ["Source", stay.source.label],
  ];
}

function render(intro: string, blocks: [string, string][][], hotel: AlertHotel): { html: string; text: string } {
  const text = [
    intro,
    "",
    ...blocks.flatMap((fields) => [...fields.map(([k, v]) => `${k}: ${v}`), ""]),
    `Calendar: ${ADMIN_CALENDAR_URL}`,
    "",
    `${hotel.name} booking alert from Abeiku.`,
  ].join("\n");
  const table = (fields: [string, string][]) =>
    `<table style="border-collapse:collapse;font-size:15px;line-height:1.5;margin:0 0 16px">${fields
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 12px 2px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:2px 0;color:#111">${esc(v)}</td></tr>`
      )
      .join("")}</table>`;
  const html =
    `<p style="font-size:16px;margin:0 0 16px;color:#111">${esc(intro)}</p>` +
    blocks.map(table).join("") +
    `<p style="font-size:15px;margin:0"><a href="${ADMIN_CALENDAR_URL}" style="color:#2a78d6">Open the calendar</a></p>`;
  return { html, text };
}

export function newBookingEmail(stay: Stay, hotel: AlertHotel) {
  const subject = oneLine(
    `New booking: ${guestName(stay)}, ${formatDateRange(stay.check_in, stay.check_out)}, ${roomsText(stay.rooms_count, hotel.totalRooms)} (${stay.source.label})`
  );
  return { subject, ...render(`New booking at ${hotel.name}.`, [stayFields(stay, hotel)], hotel) };
}

export function cancellationEmail(stay: Stay, hotel: AlertHotel) {
  const subject = oneLine(
    `Cancelled: ${guestName(stay)}, ${formatDateRange(stay.check_in, stay.check_out)}, ${roomsText(stay.rooms_count, hotel.totalRooms)} (${stay.source.label})`
  );
  return { subject, ...render(`This booking at ${hotel.name} was cancelled.`, [stayFields(stay, hotel)], hotel) };
}

/** One email for many new bookings at once (an import nobody silenced): never a flood. */
export function manyNewBookingsEmail(stays: Stay[], hotel: AlertHotel) {
  const subject = `${stays.length} new bookings at ${hotel.name}`;
  const lines = stays.map(
    (s) => `${guestName(s)}, ${formatDateRange(s.check_in, s.check_out)}, ${roomsText(s.rooms_count, hotel.totalRooms)} (${s.source.label})`
  );
  const intro = `${stays.length} new bookings came in at once (often an import). Each is on the calendar.`;
  const text = [intro, "", ...lines, "", `Calendar: ${ADMIN_CALENDAR_URL}`, "", `${hotel.name} booking alert from Abeiku.`].join("\n");
  const html =
    `<p style="font-size:16px;margin:0 0 16px;color:#111">${esc(intro)}</p>` +
    `<ul style="font-size:15px;line-height:1.5;padding-left:20px;margin:0 0 16px">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` +
    `<p style="font-size:15px;margin:0"><a href="${ADMIN_CALENDAR_URL}" style="color:#2a78d6">Open the calendar</a></p>`;
  return { subject, html, text };
}

export function arrivalsDigestEmail(stays: Stay[], date: string, hotel: AlertHotel) {
  const rooms = stays.reduce((s, x) => s + x.rooms_count, 0);
  const subject = `Arriving tomorrow (${formatDay(date)}): ${stays.length} booking${stays.length === 1 ? "" : "s"}, ${roomsText(rooms, hotel.totalRooms)}`;
  return {
    subject,
    ...render(
      `${stays.length} booking${stays.length === 1 ? "" : "s"} check${stays.length === 1 ? "s" : ""} in at ${hotel.name} tomorrow, ${formatDay(date)}.`,
      stays.map((s) => stayFields(s, hotel)),
      hotel
    ),
  };
}

// ── Sending ──────────────────────────────────────────────────────────────

/** Claim every row of each stay, email it, release on failure. Returns emails sent / failed. */
async function sendForStays(
  store: AlertStore,
  mailer: Mailer,
  hotel: AlertHotel,
  stays: Stay[],
  field: AlertField,
  build: (stay: Stay, hotel: AlertHotel) => { subject: string; html: string; text: string }
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const stay of stays) {
    const claimed = await store.claim(stay.rows.map((r) => r.id), field);
    if (!claimed.length) continue; // another run got there first
    const rows = stay.rows.filter((r) => claimed.includes(r.id));
    const mine = rows.length === stay.rows.length ? stay : { ...stay, rows, check_in: rows[0].check_in, check_out: rows[rows.length - 1].check_out, nights: rows.reduce((n, r) => n + nightsBetween(r.check_in, r.check_out), 0) };
    const msg = build(mine, hotel);
    let ok = false;
    try {
      const res = await mailer({ to: hotel.alert_email, ...msg });
      ok = res.success;
      if (!ok) console.error(`[booking-alerts] ${field} email failed: ${res.error ?? "unknown"}`);
    } catch (err) {
      console.error(`[booking-alerts] ${field} email failed:`, (err as Error)?.message ?? err);
    }
    if (ok) sent++;
    else {
      failed++;
      await store.release(claimed, field);
    }
  }
  return { sent, failed };
}

async function alertRows(
  store: AlertStore,
  mailer: Mailer,
  hotel: AlertHotel,
  pendingNew: CalendarBookingRow[],
  pendingCancel: (CalendarBookingRow & { alert_new_sent_at: string | null })[],
  counts: AlertCounts
): Promise<void> {
  // A row created and cancelled before its first alert: nothing to tell, mark both.
  const neverAnnounced = pendingCancel.filter((r) => !r.alert_new_sent_at).map((r) => r.id);
  const deadNew = pendingNew.filter((r) => r.booking_status === "cancelled").map((r) => r.id);
  const silentIds = [...new Set([...neverAnnounced, ...deadNew])];
  if (silentIds.length) {
    const a = await store.claim(silentIds, "alert_new_sent_at");
    const b = await store.claim(silentIds, "alert_cancel_sent_at");
    counts.silenced += new Set([...a, ...b]).size;
  }

  const live = pendingNew.filter((r) => r.booking_status !== "cancelled");
  const stays = groupStays(live);
  if (stays.length > MAX_SEPARATE_EMAILS) {
    // Many at once: one summary email, all rows claimed together.
    const all: Stay = { ...stays[0], rows: stays.flatMap((s) => s.rows) };
    const n = await sendForStays(store, mailer, hotel, [all], "alert_new_sent_at", (s, h) => manyNewBookingsEmail(groupStays(s.rows), h));
    counts.newSent += n.sent;
    counts.failed += n.failed;
  } else {
    const n = await sendForStays(store, mailer, hotel, stays, "alert_new_sent_at", newBookingEmail);
    counts.newSent += n.sent;
    counts.failed += n.failed;
  }

  const cancels = pendingCancel.filter((r) => r.alert_new_sent_at);
  const c = await sendForStays(store, mailer, hotel, groupStays(cancels), "alert_cancel_sent_at", cancellationEmail);
  counts.cancelSent += c.sent;
  counts.failed += c.failed;
}

async function hotelsOrSkip(store: AlertStore, where: string, counts: AlertCounts): Promise<AlertHotel[] | null> {
  try {
    return await store.listAlertHotels();
  } catch (err) {
    counts.skipped = logSkip(where, err);
    return null;
  }
}

/**
 * New-booking and cancellation alerts for every hotel with an alert address
 * (or just `hotelId`). Safe to run as often as you like.
 */
export async function runBookingAlerts(input: {
  store: AlertStore;
  mailer: Mailer;
  today: string;
  hotelId?: string;
  /** Hotels whose backfill couldn't be marked this run: not swept, or the backfill would be emailed. */
  skipHotelIds?: string[];
}): Promise<AlertCounts> {
  const { store, mailer, today } = input;
  const counts = emptyCounts();
  const hotels = await hotelsOrSkip(store, "sweep", counts);
  if (!hotels) return counts;
  for (const hotel of hotels) {
    if (input.hotelId && hotel.id !== input.hotelId) continue;
    if (input.skipHotelIds?.includes(hotel.id)) continue;
    try {
      const [pendingNew, pendingCancel] = await Promise.all([store.listPendingNew(hotel.id), store.listPendingCancel(hotel.id, today)]);
      await alertRows(store, mailer, hotel, pendingNew, pendingCancel, counts);
    } catch (err) {
      counts.skipped = logSkip(`sweep ${hotel.slug}`, err);
    }
  }
  return counts;
}

/** Alerts for specific rows right after a write (website report, admin cancel). Never throws. */
export async function alertBookingsNow(input: { store: AlertStore; mailer: Mailer; hotelId: string; ids: string[]; today: string }): Promise<AlertCounts> {
  const { store, mailer, hotelId, ids, today } = input;
  const counts = emptyCounts();
  try {
    const hotels = await hotelsOrSkip(store, "alert", counts);
    const hotel = hotels?.find((h) => h.id === hotelId);
    if (!hotel || !ids.length) return counts;
    const rows = await store.getRows(hotelId, ids);
    await alertRows(
      store,
      mailer,
      hotel,
      rows.filter((r) => !r.alert_new_sent_at),
      rows.filter((r) => r.booking_status === "cancelled" && !r.alert_cancel_sent_at && r.check_out >= today),
      counts
    );
  } catch (err) {
    counts.skipped = logSkip("alert", err);
  }
  return counts;
}

/**
 * Does this row come from that feed? (Website bookings reach the sync through the Google calendar.)
 * Per-hotel feeds (docs/l2-feeds) are keyed "feed:<id>" and own the rows with that feed_id.
 */
export function rowFromFeed(
  row: Pick<CalendarBookingRow, "source"> & { calendar_event_id?: string | null; feed_id?: string | null },
  feed: string
): boolean {
  if (feed.startsWith("feed:")) return row.feed_id === feed.slice(5);
  if (feed === "google_calendar") return row.source === "google_calendar" || (row.source === "aracuya_web" && Boolean(row.calendar_event_id));
  return row.source === feed;
}

/**
 * Run after a sync, before the sweep. A feed that has never synced before brings in its
 * whole history (its backfill): its rows still waiting for a new-booking alert are marked
 * without an email. Then every feed that loaded counts as synced. If marking fails, the feed
 * is not recorded as synced, so the next run tries again (and the caller must not sweep).
 */
export async function silenceBackfill(input: {
  store: AlertStore;
  hotelId: string;
  /** Feeds that loaded this run. */
  loadedFeeds: string[];
  /** Feeds that had synced before this run (read before the sync started). */
  syncedBefore: Set<string>;
}): Promise<number> {
  const { store, hotelId } = input;
  const fresh = input.loadedFeeds.filter((f) => !input.syncedBefore.has(f));
  if (!fresh.length) return 0;
  const pending = await store.listPendingNew(hotelId);
  const ids = pending.filter((r) => fresh.some((f) => rowFromFeed(r, f))).map((r) => r.id);
  // Only the new-booking alert: if one of these stays is cancelled later, that is news.
  const silenced = ids.length ? (await store.claim(ids, "alert_new_sent_at")).length : 0;
  await store.markFeedsSynced(hotelId, fresh);
  return silenced;
}

/**
 * The "arriving tomorrow" digest, once per hotel per date. `tomorrow` is the arrival date
 * (YYYY-MM-DD, Ghana time = UTC). No email when nobody arrives.
 */
export async function sendArrivalsDigest(input: { store: AlertStore; mailer: Mailer; tomorrow: string }): Promise<{ sent: number; empty: number; already: number; failed: number; skipped?: string }> {
  const { store, mailer, tomorrow } = input;
  const out = { sent: 0, empty: 0, already: 0, failed: 0 } as { sent: number; empty: number; already: number; failed: number; skipped?: string };
  const counts = emptyCounts();
  const hotels = await hotelsOrSkip(store, "digest", counts);
  if (!hotels) return { ...out, skipped: counts.skipped };

  for (const hotel of hotels) {
    try {
      // Look back so a stay entered as one-night rows that began earlier isn't counted as an arrival.
      const rows = await store.listByCheckIn(hotel.id, addDays(tomorrow, -62), tomorrow);
      const arrivals = groupStays(rows.filter((r) => r.booking_status !== "cancelled")).filter((s) => s.check_in === tomorrow);
      if (!arrivals.length) {
        out.empty++;
        continue;
      }
      if (!(await store.claimDigest(hotel.id, "arrivals", tomorrow))) {
        out.already++;
        continue;
      }
      const msg = arrivalsDigestEmail(arrivals, tomorrow, hotel);
      let ok = false;
      try {
        const res = await mailer({ to: hotel.alert_email, ...msg });
        ok = res.success;
        if (!ok) console.error(`[booking-alerts] digest email failed: ${res.error ?? "unknown"}`);
      } catch (err) {
        console.error("[booking-alerts] digest email failed:", (err as Error)?.message ?? err);
      }
      if (ok) out.sent++;
      else {
        out.failed++;
        await store.releaseDigest(hotel.id, "arrivals", tomorrow);
      }
    } catch (err) {
      out.skipped = logSkip(`digest ${hotel.slug}`, err);
    }
  }
  return out;
}
