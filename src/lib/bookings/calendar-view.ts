// Pure helpers for the admin Calendar page (C1 UI): where a booking came from,
// grouping one-night rows into stays, lanes, nightly occupancy and arrival lists.
// Display only: nothing here changes stored rows.

import type { BookingSource } from "./hotel-bookings";

/** What the admin calendar reads for one bookings row. New columns may be missing before the migration runs. */
export interface CalendarBookingRow {
  id: string;
  source?: BookingSource | null;
  external_ref?: string | null;
  guest_name: string;
  phone: string | null;
  guest_email?: string | null;
  guests?: number | null;
  room_slug: string;
  rooms_count: number;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD (day the guest leaves)
  total_price: number | string;
  currency: string;
  payment_status: string;
  payment_provider?: string | null;
  booking_status: string;
  ref_code?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

/** Only the fields the calendar shows (no internal columns). */
export function toCalendarRow(r: Record<string, unknown>): CalendarBookingRow {
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    id: String(r.id),
    source: (s("source") as CalendarBookingRow["source"]) ?? null,
    external_ref: s("external_ref"),
    guest_name: s("guest_name") ?? "",
    phone: s("phone"),
    guest_email: s("guest_email"),
    guests: r.guests == null ? null : Number(r.guests),
    room_slug: s("room_slug") ?? "",
    rooms_count: Number(r.rooms_count) || 1,
    check_in: String(r.check_in).slice(0, 10),
    check_out: String(r.check_out).slice(0, 10),
    total_price: Number(r.total_price) || 0,
    currency: s("currency") ?? "",
    payment_status: s("payment_status") ?? "unpaid",
    payment_provider: s("payment_provider"),
    booking_status: s("booking_status") ?? "confirmed",
    ref_code: s("ref_code"),
    paid_at: s("paid_at"),
    created_at: s("created_at"),
  };
}

export type SourceKind = "website" | "momo" | "google" | "airbnb" | "vrbo" | "booking_com" | "whatsapp" | "manual";

export interface SourceInfo {
  kind: SourceKind;
  label: string;
  /** Categorical colour (validated palette, fixed order). Used for a swatch/stripe; text stays in ink colours. */
  color: string;
  /** Imported bookings are read-only in Abeiku. */
  imported: boolean;
  /** Where to edit an imported booking ("edit this in …"). */
  editIn?: string;
}

// Fixed order, never cycled (dataviz categorical palette, light mode).
export const SOURCES: Record<SourceKind, SourceInfo> = {
  website: { kind: "website", label: "Website", color: "#2a78d6", imported: true, editIn: "the aracuya.com bookings admin" },
  momo: { kind: "momo", label: "MoMo", color: "#eb6834", imported: true, editIn: "the aracuya.com bookings admin" },
  google: { kind: "google", label: "Google calendar", color: "#1baf7a", imported: true, editIn: "the Google booking calendar" },
  airbnb: { kind: "airbnb", label: "Airbnb", color: "#eda100", imported: true, editIn: "Airbnb" },
  vrbo: { kind: "vrbo", label: "VRBO", color: "#e87ba4", imported: true, editIn: "VRBO" },
  booking_com: { kind: "booking_com", label: "Booking.com", color: "#008300", imported: true, editIn: "Booking.com" },
  whatsapp: { kind: "whatsapp", label: "WhatsApp", color: "#6250d6", imported: false },
  manual: { kind: "manual", label: "Manual", color: "#e34948", imported: false },
};

export const SOURCE_ORDER: SourceKind[] = ["website", "momo", "google", "airbnb", "vrbo", "booking_com", "whatsapp", "manual"];

/**
 * The badge for a row. `aracuya_web` paid with MoMo shows as MoMo, otherwise Website.
 * Rows from before sources existed (source NULL) were made by Abeiku's WhatsApp flow.
 */
export function sourceOf(row: Pick<CalendarBookingRow, "source" | "payment_provider">): SourceInfo {
  switch (row.source) {
    case "aracuya_web":
      return row.payment_provider === "momo" ? SOURCES.momo : SOURCES.website;
    case "google_calendar":
      return SOURCES.google;
    case "airbnb":
      return SOURCES.airbnb;
    case "vrbo":
      return SOURCES.vrbo;
    case "booking_com":
      return SOURCES.booking_com;
    case "manual":
      return SOURCES.manual;
    case "whatsapp":
    case null:
    case undefined:
      return SOURCES.whatsapp;
    default:
      return SOURCES.manual;
  }
}

// ---------- calendar blocks ----------

/** OTA iCal summaries that mean "dates closed", not a guest's stay. Reservations say "Reserved". */
const BLOCK_SUMMARY_RE = /\b(not available|unavailable|blocked|closed)\b/i;
const ICAL_BLOCK_SOURCES: readonly string[] = ["airbnb", "vrbo", "booking_com"];

/** Is this iCal summary a block (e.g. Airbnb's "Airbnb (Not available)") rather than a reservation? */
export function isBlockSummary(summary: string | null | undefined): boolean {
  const s = (summary ?? "").trim();
  return !/^reserved\b/i.test(s) && BLOCK_SUMMARY_RE.test(s);
}

/**
 * A row synced from an OTA iCal feed that only closes dates (host block, Airbnb's rolling
 * "Not available" window end). It still takes the rooms (availability is unchanged), but it is
 * not a booking: no alerts, no arrivals, labelled as a block on the calendar. Derived from the
 * stored label (guest_name = "<OTA> · <summary>"), so rows synced before this check count too.
 */
export function isCalendarBlock(row: Pick<CalendarBookingRow, "source" | "guest_name">): boolean {
  return Boolean(row.source && ICAL_BLOCK_SOURCES.includes(row.source)) && isBlockSummary(row.guest_name);
}

// ---------- dates (plain YYYY-MM-DD strings, UTC arithmetic, no time zones) ----------

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

export function dayRange(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

// ---------- stays ----------

export interface Stay {
  /** Id of the first row (stable key; opens that row's detail). */
  id: string;
  rows: CalendarBookingRow[];
  source: SourceInfo;
  guest_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  rooms_count: number;
  cancelled: boolean;
  /** An OTA calendar block, not a guest (see isCalendarBlock); guest_name is then "Blocked · <OTA>". */
  block: boolean;
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Groups rows into stays. Staff enter a multi-night stay as one-night Google events,
 * so back-to-back rows (one's check_out = next one's check_in) of the same guest,
 * same source, same rooms count and same cancelled state become one stay.
 * Only one-night rows are joined; a multi-night row is always its own stay.
 */
export function groupStays(rows: CalendarBookingRow[]): Stay[] {
  const sorted = [...rows].sort((a, b) => a.check_in.localeCompare(b.check_in) || a.id.localeCompare(b.id));
  const open = new Map<string, Stay>(); // key -> stay that can still be extended
  const stays: Stay[] = [];
  for (const row of sorted) {
    const source = sourceOf(row);
    const cancelled = row.booking_status === "cancelled";
    const nights = nightsBetween(row.check_in, row.check_out);
    const block = isCalendarBlock(row);
    const key = [source.kind, normName(row.guest_name), row.rooms_count, cancelled, block].join("|");
    const prev = open.get(key);
    if (nights === 1 && prev && prev.check_out === row.check_in) {
      prev.rows.push(row);
      prev.check_out = row.check_out;
      prev.nights += 1;
      continue;
    }
    const stay: Stay = {
      id: row.id,
      rows: [row],
      source,
      guest_name: block ? `Blocked · ${source.label}` : row.guest_name,
      check_in: row.check_in,
      check_out: row.check_out,
      nights,
      rooms_count: row.rooms_count,
      cancelled,
      block,
    };
    stays.push(stay);
    if (nights === 1) open.set(key, stay);
    else open.delete(key);
  }
  return stays;
}

/** Total of the rows of a stay (prices can come back as strings). */
export function stayTotal(stay: Stay): number {
  return stay.rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0);
}

/** Paid only if every row is paid. */
export function stayPaymentStatus(stay: Stay): string {
  const all = new Set(stay.rows.map((r) => r.payment_status));
  return all.size === 1 ? [...all][0] : "partly paid";
}

// ---------- occupancy and lanes ----------

/** Rooms booked on the night that starts on `date` (not counting cancelled stays). */
export function roomsBookedOn(stays: Stay[], date: string): number {
  let n = 0;
  for (const s of stays) if (!s.cancelled && s.check_in <= date && date < s.check_out) n += s.rooms_count;
  return n;
}

export interface LaneSegment {
  stay: Stay;
  lane: number;
}

/**
 * Puts each stay in `rooms_count` lanes (rooms are identical, so any free lane will do).
 * Lanes past `totalRooms` mean overbooking. Cancelled stays get no lane.
 */
export function assignLanes(stays: Stay[], totalRooms: number): { segments: LaneSegment[]; laneCount: number } {
  const laneFreeFrom: string[] = Array.from({ length: totalRooms }, () => "");
  const segments: LaneSegment[] = [];
  const active = stays
    .filter((s) => !s.cancelled)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || b.nights - a.nights || a.id.localeCompare(b.id));
  for (const stay of active) {
    for (let k = 0; k < Math.max(1, stay.rooms_count); k++) {
      let lane = laneFreeFrom.findIndex((free) => free <= stay.check_in);
      if (lane === -1) {
        lane = laneFreeFrom.length;
        laneFreeFrom.push("");
      }
      laneFreeFrom[lane] = stay.check_out;
      segments.push({ stay, lane });
    }
  }
  return { segments, laneCount: laneFreeFrom.length };
}

// ---------- arrivals and departures ----------

export interface Movements {
  arrivals: { today: Stay[]; tomorrow: Stay[]; week: Stay[] };
  departures: { today: Stay[]; tomorrow: Stay[]; week: Stay[] };
}

/** Arrivals and departures for today, tomorrow and the rest of the next 7 days (cancelled stays and blocks left out). */
export function movements(stays: Stay[], today: string): Movements {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7); // exclusive
  const pick = (field: "check_in" | "check_out") => {
    const live = stays.filter((s) => !s.cancelled && !s.block).sort((a, b) => a[field].localeCompare(b[field]));
    return {
      today: live.filter((s) => s[field] === today),
      tomorrow: live.filter((s) => s[field] === tomorrow),
      week: live.filter((s) => s[field] > tomorrow && s[field] < weekEnd),
    };
  };
  return { arrivals: pick("check_in"), departures: pick("check_out") };
}
