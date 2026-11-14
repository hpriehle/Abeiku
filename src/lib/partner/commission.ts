// Pure commission + status logic for partner bookings. No I/O here.

export type PartnerType = "agency" | "local" | "influencer";
export type PartnerCurrency = "GHS" | "USD";
export type CommissionKind = "percent" | "per_night";
export type BookingStatus = "paid" | "refunded" | "cancelled";
export type PayoutStatus = "unpaid" | "paid";
export type DisplayStatus = "pending" | "owed" | "paid" | "refunded" | "cancelled";

export const PARTNER_TYPES: PartnerType[] = ["agency", "local", "influencer"];

export interface CommissionRule {
  kind: CommissionKind;
  /** percent: 15 = 15%. per_night: amount per night in the partner's currency. */
  value: number;
  currency: PartnerCurrency;
}

/** Ghana partners earn and see GH₵; partners abroad earn and see USD. */
export function currencyForCountry(country: string): PartnerCurrency {
  return country.trim().toLowerCase() === "ghana" ? "GHS" : "USD";
}

/**
 * Default rule for a partner type. agency = 15%, local = GH₵150/night (Ghana only).
 * Influencers (and local partners abroad) have no default: the rule is agreed per partner.
 */
export function defaultRule(type: PartnerType, currency: PartnerCurrency): CommissionRule | null {
  if (type === "agency") return { kind: "percent", value: 15, currency };
  if (type === "local" && currency === "GHS") return { kind: "per_night", value: 150, currency };
  return null;
}

export interface BookingAmounts {
  nights: number | null;
  room_total_usd: number | null;
  total_ghs: number | null;
  ghs_per_usd: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Room total in the given currency, converting with ghs_per_usd if only the other total is known. */
export function roomTotalIn(currency: PartnerCurrency, b: BookingAmounts): number | null {
  if (currency === "GHS") {
    if (b.total_ghs != null) return b.total_ghs;
    if (b.room_total_usd != null && b.ghs_per_usd) return b.room_total_usd * b.ghs_per_usd;
    return null;
  }
  if (b.room_total_usd != null) return b.room_total_usd;
  if (b.total_ghs != null && b.ghs_per_usd) return b.total_ghs / b.ghs_per_usd;
  return null;
}

/**
 * Commission for one booking, in the rule's currency.
 * GHS partner: percent of total_ghs, or value x nights.
 * USD partner: percent of room_total_usd, or value x nights.
 */
export function computeCommission(rule: CommissionRule, b: BookingAmounts): number {
  if (rule.kind === "per_night") {
    return round2(rule.value * Math.max(0, b.nights ?? 0));
  }
  const base = roomTotalIn(rule.currency, b);
  if (base == null) return 0;
  return round2((rule.value / 100) * base);
}

/** Today's date (YYYY-MM-DD) in Ghana time (UTC+0, no DST). */
export function todayInGhana(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface StatusInput {
  status: BookingStatus;
  check_out: string | null;
  payout_status: PayoutStatus;
}

/**
 * pending: paid, check_out not yet passed.
 * owed: paid, check_out date has passed (today > check_out), payout not marked.
 * paid: payout marked (wins even if the booking was later refunded: the money went out).
 * refunded / cancelled: never owed.
 */
export function displayStatus(b: StatusInput, today: string = todayInGhana()): DisplayStatus {
  if (b.payout_status === "paid") return "paid";
  if (b.status === "refunded") return "refunded";
  if (b.status === "cancelled") return "cancelled";
  if (b.check_out && today > b.check_out.slice(0, 10)) return "owed";
  return "pending";
}

/** Commission shown to the partner: 0 for refunded/cancelled bookings. */
export function displayCommission(b: StatusInput & { commission_amount: number }, today?: string): number {
  const s = displayStatus(b, today);
  return s === "refunded" || s === "cancelled" ? 0 : Number(b.commission_amount) || 0;
}

export interface Totals {
  pending: number;
  owed: number;
  paid: number;
}

export function totalsFor(
  rows: (StatusInput & { commission_amount: number })[],
  today: string = todayInGhana()
): Totals {
  const t: Totals = { pending: 0, owed: 0, paid: 0 };
  for (const r of rows) {
    const s = displayStatus(r, today);
    if (s === "pending" || s === "owed" || s === "paid") t[s] = round2(t[s] + (Number(r.commission_amount) || 0));
  }
  return t;
}

const REF_CODE_RE = /^[a-z0-9-]{2,40}$/;

export function normalizeRefCode(code: string): string {
  return code.trim().toLowerCase();
}

export function isValidRefCode(code: string): boolean {
  return REF_CODE_RE.test(normalizeRefCode(code));
}

export function formatMoney(amount: number, currency: PartnerCurrency): string {
  const n = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "GHS" ? `GH₵${n}` : `$${n}`;
}
