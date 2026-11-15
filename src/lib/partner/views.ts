// Shapes partner + booking data for the admin and partner dashboards.

import {
  displayCommission,
  displayStatus,
  todayInGhana,
  totalsFor,
  type DisplayStatus,
  type Totals,
} from "./commission";
import type { ReferralBookingRow } from "./booking-report";
import type { Influencer } from "@/lib/db/influencers";
import { getHotelById } from "@/lib/db";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com").replace(/\/$/, "");

/** Setup links are copied into a reply by hand, so they live longer than a typical invite. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** A reset link opens an existing account, so it expires sooner than a first invite. */
export const RESET_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function setupUrl(token: string): string {
  return `${APP_URL}/partner/setup?token=${token}`;
}

/**
 * The public website a hotel's partner links point to, or null if the hotel has none set up.
 * PARTNER_SITE_URLS maps hotel slug to site, e.g. {"aracuya":"https://aracuya.com"}.
 * Aracuya defaults to ARACUYA_URL, else https://aracuya.com. Other hotels get no link until
 * their site is listed (and reports bookings with the ref code), rather than a link to the
 * wrong hotel.
 */
export function partnerSiteUrl(hotelSlug: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let sites: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(env.PARTNER_SITE_URLS || "{}");
    if (parsed && typeof parsed === "object") sites = parsed;
  } catch {
    console.error("PARTNER_SITE_URLS is not valid JSON; ignoring it");
  }
  const fromMap = sites[hotelSlug];
  const url =
    typeof fromMap === "string" && /^https?:\/\//.test(fromMap)
      ? fromMap
      : hotelSlug === "aracuya"
        ? env.ARACUYA_URL || "https://aracuya.com"
        : null;
  return url ? url.replace(/\/+$/, "") : null;
}

/** Partner link for a ref code on the hotel's site; null when the hotel has no site set up. */
export function partnerLink(refCode: string, siteUrl: string | null): string | null {
  return siteUrl ? `${siteUrl}/?ref=${encodeURIComponent(refCode)}` : null;
}

export interface BookingView {
  id: string;
  booking_ref: string;
  partner_id: string | null;
  partner_name: string | null;
  ref_code: string;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  room_total_usd: number | null;
  total_ghs: number | null;
  status: DisplayStatus;
  commission: number;
  commission_currency: "GHS" | "USD" | null;
  payout_paid_at: string | null;
  payout_note: string | null;
}

export function bookingView(
  b: ReferralBookingRow,
  partnerName: string | null = null,
  today: string = todayInGhana()
): BookingView {
  return {
    id: b.id,
    booking_ref: b.booking_ref,
    partner_id: b.influencer_id,
    partner_name: partnerName,
    ref_code: b.ref_code,
    check_in: b.check_in,
    check_out: b.check_out,
    nights: b.nights,
    room_total_usd: b.room_total_usd == null ? null : Number(b.room_total_usd),
    total_ghs: b.total_ghs == null ? null : Number(b.total_ghs),
    status: displayStatus(b, today),
    commission: displayCommission({ ...b, commission_amount: Number(b.commission_amount) }, today),
    commission_currency: b.commission_currency,
    payout_paid_at: b.payout_paid_at,
    payout_note: b.payout_note,
  };
}

export interface PartnerView {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  town: string | null;
  code: string;
  /** Null when the hotel has no partner site set up (see partnerSiteUrl). */
  link: string | null;
  partner_type: Influencer["partner_type"];
  country: string;
  currency: Influencer["currency"];
  commission_kind: Influencer["commission_kind"];
  commission_value: number;
  password_set: boolean;
  created_at: string;
  bookings: number;
  totals: Totals;
}

export function buildAdminView(partners: Influencer[], bookings: ReferralBookingRow[], siteUrl: string | null) {
  const today = todayInGhana();
  const names = new Map(partners.map((p) => [p.id, p.name]));
  const byPartner = new Map<string, ReferralBookingRow[]>();
  for (const b of bookings) {
    if (!b.influencer_id) continue;
    const list = byPartner.get(b.influencer_id) ?? [];
    list.push(b);
    byPartner.set(b.influencer_id, list);
  }

  const partnerViews: PartnerView[] = partners.map((p) => {
    const rows = byPartner.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      whatsapp: p.whatsapp,
      town: p.town,
      code: p.slug,
      link: partnerLink(p.slug, siteUrl),
      partner_type: p.partner_type,
      country: p.country,
      currency: p.currency,
      commission_kind: p.commission_kind,
      commission_value: Number(p.commission_value),
      password_set: Boolean(p.password_hash),
      created_at: p.created_at,
      bookings: rows.length,
      totals: totalsFor(rows.map((r) => ({ ...r, commission_amount: Number(r.commission_amount) })), today),
    };
  });

  return {
    site_url: siteUrl,
    partners: partnerViews,
    bookings: bookings.map((b) =>
      bookingView(b, b.influencer_id ? names.get(b.influencer_id) ?? null : null, today)
    ),
  };
}

/** Partner site of the admin's hotel (the admin session has the hotel id, not the slug). */
export async function adminSiteUrl(hotelId: string): Promise<string | null> {
  const hotel = await getHotelById(hotelId);
  return hotel ? partnerSiteUrl(hotel.slug) : null;
}
