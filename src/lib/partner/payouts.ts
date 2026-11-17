// P2 step 5: hotel-recorded payouts. No money moves through Abeiku: the hotel pays its partner
// itself (by bank transfer, for example) and records it here.
//
// A payout covers owed bookings the hotel ticks (all owed by default). Those bookings are marked
// paid (referral_bookings.payout_status / payout_paid_at / payout_note, as P1's per-booking "Mark
// paid") and linked to the payout (payout_id). The partner_payouts row keeps what was actually
// sent: amount and currency may differ from the bookings' commission (rounding, other currency).
// Owed / Paid figures stay booking-based (src/lib/partner/commission.ts totalsFor).
//
// Until docs/go-live-p2-signup-payouts.sql has run: lists are empty and recording answers 503.

import type { ReferralBookingRow } from "./booking-report";
import type { HandlerResult } from "./bulk";
import { displayStatus, todayInGhana, type PartnerCurrency } from "./commission";
import { PAYOUT_ADMIN } from "./p2-copy";

export interface PayoutRow {
  id: string;
  hotel_id: string;
  influencer_id: string;
  amount: number;
  currency: PartnerCurrency;
  /** YYYY-MM-DD */
  paid_on: string;
  method: string;
  reference: string | null;
  created_at: string;
}

export type NewPayout = Omit<PayoutRow, "id" | "created_at"> & { recorded_by: string | null };

export interface PayoutStore {
  ready(): Promise<boolean>;
  insert(row: NewPayout): Promise<PayoutRow>;
  /** Only used to undo a payout whose bookings could not be marked (same request). */
  remove(id: string): Promise<void>;
  /** Marks these unpaid bookings of the partner paid and links them. Returns how many changed. */
  markBookingsPaid(
    influencerId: string,
    bookingIds: string[],
    payout: { id: string; paid_on: string; note: string }
  ): Promise<number>;
  listForPartner(influencerId: string): Promise<PayoutRow[]>;
  listForHotel(hotelId: string): Promise<PayoutRow[]>;
}

export interface PartnerRef {
  id: string;
  hotel_id: string;
  name: string;
}

export interface RecordPayoutDeps {
  payouts: PayoutStore;
  getPartner(id: string): Promise<PartnerRef | null>;
  listBookings(influencerId: string): Promise<ReferralBookingRow[]>;
  now?: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Note on each booking, shown under "Paid {date}" in the P1 bookings list. */
export function bookingNote(method: string, reference: string | null): string {
  return reference ? `${method} · ${reference}` : method;
}

/** POST /api/admin/influencers/[id]/payouts */
export async function handleRecordPayout(
  admin: { hotelId: string; userId: string | null },
  partnerId: string,
  body: unknown,
  deps: RecordPayoutDeps
): Promise<HandlerResult> {
  const partner = await deps.getPartner(partnerId);
  // Another hotel's partner looks the same as no partner.
  if (!partner || partner.hotel_id !== admin.hotelId) return { status: 404, body: { error: "Not found" } };

  const b = (body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(b.booking_ids) ? [...new Set(b.booking_ids.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length === 0 || ids.length > 500) return { status: 400, body: { error: PAYOUT_ADMIN.errBookings } };

  const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return { status: 400, body: { error: PAYOUT_ADMIN.errAmount } };

  const currency = b.currency;
  if (currency !== "GHS" && currency !== "USD") return { status: 400, body: { error: "Currency must be GHS or USD." } };

  const today = todayInGhana(deps.now);
  const paidOn = typeof b.paid_on === "string" ? b.paid_on : "";
  // Up to a day ahead: the hotel's clock may be ahead of Ghana time.
  if (!DATE_RE.test(paidOn) || Number.isNaN(Date.parse(paidOn)) || paidOn > addDays(today, 1)) {
    return { status: 400, body: { error: PAYOUT_ADMIN.errDate } };
  }

  const method = typeof b.method === "string" ? b.method.trim() : "";
  if (!method || method.length > 100) return { status: 400, body: { error: PAYOUT_ADMIN.errMethod } };
  const reference = typeof b.reference === "string" && b.reference.trim() ? b.reference.trim().slice(0, 100) : null;

  if (!(await deps.payouts.ready())) return { status: 503, body: { error: PAYOUT_ADMIN.errNotReady } };

  // Every ticked booking must be this partner's and owed right now.
  const owed = new Set(
    (await deps.listBookings(partner.id))
      .filter((r) => r.hotel_id === admin.hotelId && displayStatus(r, today) === "owed")
      .map((r) => r.id)
  );
  if (!ids.every((id) => owed.has(id))) return { status: 409, body: { error: PAYOUT_ADMIN.errNotOwed } };

  const payout = await deps.payouts.insert({
    hotel_id: admin.hotelId,
    influencer_id: partner.id,
    amount: round2(amount),
    currency,
    paid_on: paidOn,
    method,
    reference,
    recorded_by: admin.userId,
  });
  let marked: number;
  try {
    marked = await deps.payouts.markBookingsPaid(partner.id, ids, {
      id: payout.id,
      paid_on: paidOn,
      note: bookingNote(method, reference),
    });
  } catch (err) {
    await deps.payouts.remove(payout.id).catch(() => {});
    throw err;
  }
  if (marked === 0) {
    // Someone else marked them paid in the meantime: don't keep a payout that covers nothing.
    await deps.payouts.remove(payout.id).catch(() => {});
    return { status: 409, body: { error: PAYOUT_ADMIN.errNotOwed } };
  }
  return { status: 200, body: { ok: true, payout: adminPayoutView(payout, partner.name), marked } };
}

export interface AdminPayoutView {
  id: string;
  partner_id: string;
  partner_name: string | null;
  amount: number;
  currency: PartnerCurrency;
  paid_on: string;
  method: string;
  reference: string | null;
}

export function adminPayoutView(p: PayoutRow, partnerName: string | null): AdminPayoutView {
  return {
    id: p.id,
    partner_id: p.influencer_id,
    partner_name: partnerName,
    amount: Number(p.amount),
    currency: p.currency,
    paid_on: p.paid_on,
    method: p.method,
    reference: p.reference,
  };
}

export interface PartnerPayoutView {
  amount: number;
  currency: PartnerCurrency;
  paid_on: string;
  method: string;
  reference: string | null;
}

/** What the partner sees of a payout (no ids, no who-recorded-it). */
export function partnerPayoutView(p: PayoutRow): PartnerPayoutView {
  return { amount: Number(p.amount), currency: p.currency, paid_on: p.paid_on, method: p.method, reference: p.reference };
}

/** Commission total (in the partner's currency) of the given bookings: the amount the form fills in. */
export function commissionTotal(rows: { id: string; commission: number }[], ids: Iterable<string>): number {
  const pick = new Set(ids);
  return round2(rows.filter((r) => pick.has(r.id)).reduce((s, r) => s + (Number(r.commission) || 0), 0));
}
