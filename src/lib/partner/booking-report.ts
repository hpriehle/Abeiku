// Handles booking reports from a hotel site (aracuya.com) for partner commission.
// Storage is injected so the logic can be tested with an in-memory store.

import { createHash, timingSafeEqual } from "crypto";
import {
  computeCommission,
  normalizeRefCode,
  type BookingStatus,
  type CommissionKind,
  type PartnerCurrency,
  type PayoutStatus,
} from "./commission";
import { recordWebBooking, type HotelBookingsStore } from "@/lib/bookings/web-ingest";

export type BookingEvent = BookingStatus;
const EVENTS: BookingEvent[] = ["paid", "refunded", "cancelled"];

export interface BookingReport {
  event: BookingEvent;
  booking_ref: string;
  /** Normalized partner code; "" when the booking came without one. */
  ref_code: string;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  room_total_usd: number | null;
  total_ghs: number | null;
  ghs_per_usd: number | null;
  amount_paid: number | null;
  currency: string | null;
  paid_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  /** Rooms booked (Aracuya: 1-3), from rooms_count or room.id. */
  rooms_count: number | null;
  room_name: string | null;
  guests: number | null;
}

export interface PartnerRule {
  id: string;
  commission_kind: CommissionKind;
  commission_value: number;
  commission_currency: PartnerCurrency;
}

export interface ReferralBookingRow {
  id: string;
  hotel_id: string;
  booking_ref: string;
  influencer_id: string | null;
  ref_code: string;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  room_total_usd: number | null;
  total_ghs: number | null;
  ghs_per_usd: number | null;
  amount_paid: number | null;
  currency: string | null;
  paid_at: string | null;
  status: BookingStatus;
  commission_amount: number;
  commission_currency: PartnerCurrency | null;
  payout_status: PayoutStatus;
  payout_paid_at: string | null;
  payout_note: string | null;
  created_at: string;
}

export type NewBookingRow = Omit<
  ReferralBookingRow,
  "id" | "created_at" | "payout_status" | "payout_paid_at" | "payout_note"
>;
export type BookingPatch = Partial<Omit<ReferralBookingRow, "id" | "hotel_id" | "booking_ref" | "created_at">>;

export interface BookingReportStore {
  findHotelId(slug: string): Promise<string | null>;
  findPartnerByRefCode(hotelId: string, refCode: string): Promise<PartnerRule | null>;
  /** Returns false if this (hotel, booking_ref, event) was already recorded. */
  recordEvent(hotelId: string, bookingRef: string, event: BookingEvent, payload: unknown): Promise<boolean>;
  forgetEvent(hotelId: string, bookingRef: string, event: BookingEvent): Promise<void>;
  getBooking(hotelId: string, bookingRef: string): Promise<ReferralBookingRow | null>;
  insertBooking(row: NewBookingRow): Promise<void>;
  updateBooking(id: string, patch: BookingPatch): Promise<void>;
}

// ── Auth ────────────────────────────────────────────────────────────────

/** Constant-time check of "Authorization: Bearer <secret>". False if no secret is configured. */
export function isAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const match = /^Bearer\s+(.+)$/i.exec((authHeader ?? "").trim());
  const given = match ? match[1].trim() : "";
  // Hash both sides so lengths match and timingSafeEqual never throws.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) && given.length > 0;
}

// ── Validation ──────────────────────────────────────────────────────────

type Parsed = { ok: true; report: BookingReport } | { ok: false; error: string };

function optNumber(v: unknown, field: string, errors: string[]): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    errors.push(`${field} must be a non-negative number`);
    return null;
  }
  return n;
}

function optDate(v: unknown, field: string, errors: string[]): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v) || Number.isNaN(Date.parse(v.slice(0, 10)))) {
    errors.push(`${field} must be a date (YYYY-MM-DD)`);
    return null;
  }
  return v.slice(0, 10);
}

function optString(v: unknown, field: string, errors: string[], max = 200): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.length > max) {
    errors.push(`${field} must be a string`);
    return null;
  }
  return v.trim();
}

function lenientString(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** A whole number >= min (numbers or digit strings), else null. */
function lenientCount(v: unknown, min: number): number | null {
  const n = typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min ? n : null;
}

export function parseBookingReport(body: unknown): Parsed {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];

  const event = b.event as BookingEvent;
  if (!EVENTS.includes(event)) errors.push("event must be paid, refunded or cancelled");

  const booking_ref = optString(b.booking_ref, "booking_ref", errors);
  if (!booking_ref) errors.push("booking_ref is required");

  // ref_code: null/absent = booking without a partner link; an empty string is still rejected.
  const refRaw = optString(b.ref_code, "ref_code", errors);
  const ref_code = normalizeRefCode(refRaw ?? "");
  if (refRaw !== null && !ref_code) errors.push("ref_code must not be empty (send null when there is none)");
  const check_in = optDate(b.check_in, "check_in", errors);
  const check_out = optDate(b.check_out, "check_out", errors);
  const nightsRaw = optNumber(b.nights, "nights", errors);
  if (nightsRaw != null && !Number.isInteger(nightsRaw)) errors.push("nights must be a whole number");
  const room_total_usd = optNumber(b.room_total_usd, "room_total_usd", errors);
  const total_ghs = optNumber(b.total_ghs, "total_ghs", errors);
  const ghs_per_usd = optNumber(b.ghs_per_usd, "ghs_per_usd", errors);
  const amount_paid = optNumber(b.amount_paid, "amount_paid", errors);
  const currencyRaw = optString(b.currency, "currency", errors, 10);
  const paidAtRaw = optString(b.paid_at, "paid_at", errors, 60);
  if (paidAtRaw && Number.isNaN(Date.parse(paidAtRaw))) errors.push("paid_at must be an ISO timestamp");

  // Guest and room details are informational: a bad value becomes null instead of
  // rejecting the report (the partner commission must never be lost over them).
  const guest_name = lenientString(b.guest_name, 200);
  const guest_email = lenientString(b.guest_email, 200);
  const guest_phone = lenientString(b.guest_phone, 50);
  const guests = lenientCount(b.guests, 0);
  const roomObj =
    b.room && typeof b.room === "object" && !Array.isArray(b.room) ? (b.room as Record<string, unknown>) : null;
  const room_name = lenientString(roomObj?.name, 100);
  const rooms_count = lenientCount(b.rooms_count, 1) ?? lenientCount(roomObj?.id, 1);

  if (event === "paid") {
    if (!check_in) errors.push("check_in is required for paid");
    if (!check_out) errors.push("check_out is required for paid");
    if (nightsRaw == null) errors.push("nights is required for paid");
    if (room_total_usd == null && total_ghs == null) {
      errors.push("room_total_usd or total_ghs is required for paid");
    }
  }
  if (check_in && check_out && check_out < check_in) errors.push("check_out is before check_in");

  if (errors.length) return { ok: false, error: errors.join("; ") };

  return {
    ok: true,
    report: {
      event,
      booking_ref: booking_ref!,
      ref_code,
      check_in,
      check_out,
      nights: nightsRaw,
      room_total_usd,
      total_ghs,
      ghs_per_usd,
      amount_paid,
      currency: currencyRaw ? currencyRaw.toUpperCase() : null,
      paid_at: paidAtRaw ? new Date(paidAtRaw).toISOString() : null,
      guest_name,
      guest_email,
      guest_phone,
      rooms_count,
      room_name,
      guests,
    },
  };
}

// ── Handler ─────────────────────────────────────────────────────────────

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

/** Fields from the report that are stored on the booking row (only those present). */
function reportFields(r: BookingReport): BookingPatch {
  const p: BookingPatch = {};
  const keys = [
    "check_in", "check_out", "nights", "room_total_usd", "total_ghs",
    "ghs_per_usd", "amount_paid", "currency", "paid_at",
  ] as const;
  for (const k of keys) if (r[k] != null) (p as Record<string, unknown>)[k] = r[k];
  return p;
}

export async function handleBookingReport(input: {
  authHeader: string | null;
  secret: string | undefined;
  hotelSlug: string;
  body: unknown;
  store: BookingReportStore;
  /** The hotel `bookings` table: every reported booking is kept there, partner or not. */
  hotelBookings?: HotelBookingsStore;
  /** Called with the hotel bookings row the report wrote (booking alerts). Errors are logged, never returned. */
  onHotelBooking?: (hotelId: string, rowId: string) => Promise<unknown>;
}): Promise<HandlerResult> {
  if (!isAuthorized(input.authHeader, input.secret)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const parsed = parseBookingReport(input.body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const r = parsed.report;
  const { store } = input;

  const hotelId = await store.findHotelId(input.hotelSlug);
  if (!hotelId) return { status: 404, body: { error: "Hotel not found" } };

  const isNew = await store.recordEvent(hotelId, r.booking_ref, r.event, input.body);
  if (!isNew) return { status: 200, body: { ok: true, duplicate: true } };

  try {
    if (input.hotelBookings) {
      const rowId = await recordWebBooking(input.hotelBookings, { hotelId, hotelSlug: input.hotelSlug, report: r });
      if (rowId && input.onHotelBooking) {
        await input.onHotelBooking(hotelId, rowId).catch((err) =>
          console.error("[booking-report] booking alert failed", (err as Error)?.message ?? err)
        );
      }
    }

    const existing = await store.getBooking(hotelId, r.booking_ref);
    const refCode = r.ref_code || existing?.ref_code || "";
    // Partner commission rows only for bookings that came with a ref code.
    if (!refCode && !existing) {
      return { status: 200, body: { ok: true, partner_found: false } };
    }
    const partner = refCode ? await store.findPartnerByRefCode(hotelId, refCode) : null;
    const fields = reportFields(r);

    if (r.event === "paid") {
      const merged = { ...existing, ...fields };
      const commission = partner
        ? computeCommission(
            {
              kind: partner.commission_kind,
              value: Number(partner.commission_value),
              currency: partner.commission_currency,
            },
            {
              nights: merged.nights ?? null,
              room_total_usd: merged.room_total_usd ?? null,
              total_ghs: merged.total_ghs ?? null,
              ghs_per_usd: merged.ghs_per_usd ?? null,
            }
          )
        : 0;

      if (!existing) {
        await store.insertBooking({
          hotel_id: hotelId,
          booking_ref: r.booking_ref,
          influencer_id: partner?.id ?? null,
          ref_code: refCode,
          check_in: null, check_out: null, nights: null, room_total_usd: null, total_ghs: null,
          ghs_per_usd: null, amount_paid: null, currency: null, paid_at: null,
          ...fields,
          status: "paid",
          commission_amount: commission,
          commission_currency: partner?.commission_currency ?? null,
        });
      } else {
        // A refund/cancel that arrived first wins; a payout already made is left alone.
        const keepCommission = existing.status !== "paid" || existing.payout_status === "paid";
        await store.updateBooking(existing.id, {
          ...fields,
          influencer_id: existing.influencer_id ?? partner?.id ?? null,
          ref_code: refCode,
          ...(keepCommission
            ? {}
            : { commission_amount: commission, commission_currency: partner?.commission_currency ?? null }),
        });
      }
    } else {
      if (!existing) {
        await store.insertBooking({
          hotel_id: hotelId,
          booking_ref: r.booking_ref,
          influencer_id: partner?.id ?? null,
          ref_code: refCode,
          check_in: null, check_out: null, nights: null, room_total_usd: null, total_ghs: null,
          ghs_per_usd: null, amount_paid: null, currency: null, paid_at: null,
          ...fields,
          status: r.event,
          commission_amount: 0,
          commission_currency: partner?.commission_currency ?? null,
        });
      } else {
        await store.updateBooking(existing.id, {
          status: r.event,
          ...(existing.payout_status === "paid" ? {} : { commission_amount: 0 }),
        });
      }
    }

    return { status: 200, body: { ok: true, partner_found: Boolean(partner) } };
  } catch (err) {
    // Let a retry (aracuya calls twice) process the event again.
    await store.forgetEvent(hotelId, r.booking_ref, r.event).catch(() => {});
    throw err;
  }
}
