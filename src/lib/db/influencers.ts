import { supabase } from "@/lib/supabase/client";
import type { CommissionKind, PartnerCurrency, PartnerType } from "@/lib/partner/commission";
import type { PartnerAdminStore } from "@/lib/partner/bulk";
import type {
  BookingEvent,
  BookingPatch,
  BookingReportStore,
  NewBookingRow,
  PartnerRule,
  ReferralBookingRow,
} from "@/lib/partner/booking-report";

export interface Influencer {
  id: string;
  hotel_id: string;
  slug: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  town: string | null;
  ghl_contact_id: string | null;
  password_hash: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  redirect_url: string;
  created_at: string;
  last_login_at: string | null;
  partner_type: PartnerType;
  country: string;
  currency: PartnerCurrency;
  commission_kind: CommissionKind;
  commission_value: number;
  commission_currency: PartnerCurrency;
}

export interface InfluencerClick {
  id: string;
  influencer_id: string;
  clicked_at: string;
  ip_hash: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
}

export interface ClickStatsRow {
  date: string;
  count: number;
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "partner", "about", "contact", "rooms", "reserve",
  "_next", "images", "favicon.ico", "robots.txt", "sitemap.xml",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{2,40}$/i.test(slug) && !isReservedSlug(slug);
}

export async function createInfluencer(input: {
  hotel_id: string;
  slug: string;
  name: string;
  email: string | null;
  whatsapp?: string | null;
  town?: string | null;
  invite_token: string;
  invite_expires_at: string;
  redirect_url?: string;
  partner_type: PartnerType;
  country: string;
  currency: PartnerCurrency;
  commission_kind: CommissionKind;
  commission_value: number;
  commission_currency: PartnerCurrency;
}): Promise<Influencer> {
  const { data, error } = await supabase
    .from("influencers")
    .insert({
      hotel_id: input.hotel_id,
      slug: input.slug.toLowerCase(),
      name: input.name,
      email: input.email ? input.email.toLowerCase() : null,
      whatsapp: input.whatsapp ?? null,
      town: input.town ?? null,
      invite_token: input.invite_token,
      invite_expires_at: input.invite_expires_at,
      redirect_url: input.redirect_url ?? "/",
      partner_type: input.partner_type,
      country: input.country,
      currency: input.currency,
      commission_kind: input.commission_kind,
      commission_value: input.commission_value,
      commission_currency: input.commission_currency,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listInfluencersForHotel(hotelId: string): Promise<Influencer[]> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getInfluencerBySlug(hotelId: string, slug: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerByEmail(email: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Partners with this WhatsApp number (unique per hotel, so possibly one per hotel). */
export async function getInfluencersByWhatsapp(whatsapp: string): Promise<Influencer[]> {
  const { data, error } = await supabase.from("influencers").select("*").eq("whatsapp", whatsapp);
  if (error) throw error;
  return data ?? [];
}

export async function getInfluencerByWhatsapp(hotelId: string, whatsapp: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("whatsapp", whatsapp)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerById(id: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getInfluencerByInviteToken(token: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setInfluencerPassword(id: string, password_hash: string): Promise<void> {
  const { error } = await supabase
    .from("influencers")
    .update({ password_hash, invite_token: null, invite_expires_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function setInfluencerInvite(
  id: string,
  invite_token: string,
  invite_expires_at: string
): Promise<void> {
  const { error } = await supabase
    .from("influencers")
    .update({ invite_token, invite_expires_at })
    .eq("id", id)
    .is("password_hash", null);
  if (error) throw error;
}

export async function markInfluencerLogin(id: string): Promise<void> {
  const { error } = await supabase
    .from("influencers")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function logClick(input: {
  influencer_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
}): Promise<void> {
  const { error } = await supabase.from("influencer_clicks").insert({
    influencer_id: input.influencer_id,
    ip_hash: input.ip_hash,
    user_agent: input.user_agent,
    referer: input.referer,
    country: input.country,
  });
  if (error) throw error;
}

export async function getTotalClicks(influencerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("influencer_clicks")
    .select("id", { count: "exact", head: true })
    .eq("influencer_id", influencerId);
  if (error) throw error;
  return count ?? 0;
}

export async function getClicksByDay(influencerId: string, days: number): Promise<ClickStatsRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("influencer_clicks")
    .select("clicked_at")
    .eq("influencer_id", influencerId)
    .gte("clicked_at", since);
  if (error) throw error;

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of data ?? []) {
    const day = (row.clicked_at as string).slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecentClicks(influencerId: string, limit: number): Promise<InfluencerClick[]> {
  const { data, error } = await supabase
    .from("influencer_clicks")
    .select("*")
    .eq("influencer_id", influencerId)
    .order("clicked_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getClickCountsByInfluencer(hotelId: string): Promise<Map<string, number>> {
  const { data: influencers, error: e1 } = await supabase
    .from("influencers")
    .select("id")
    .eq("hotel_id", hotelId);
  if (e1) throw e1;
  const ids = (influencers ?? []).map((i) => i.id);
  if (ids.length === 0) return new Map();

  const { data: clicks, error: e2 } = await supabase
    .from("influencer_clicks")
    .select("influencer_id")
    .in("influencer_id", ids);
  if (e2) throw e2;

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 0);
  for (const row of clicks ?? []) {
    counts.set(row.influencer_id, (counts.get(row.influencer_id) ?? 0) + 1);
  }
  return counts;
}

// ── Referral bookings ───────────────────────────────────────────────────

export async function listBookingsForInfluencer(influencerId: string): Promise<ReferralBookingRow[]> {
  const { data, error } = await supabase
    .from("referral_bookings")
    .select("*")
    .eq("influencer_id", influencerId)
    .order("check_in", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listBookingsForHotel(hotelId: string): Promise<ReferralBookingRow[]> {
  const { data, error } = await supabase
    .from("referral_bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("check_in", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBookingById(id: string): Promise<ReferralBookingRow | null> {
  const { data, error } = await supabase
    .from("referral_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setBookingPayout(
  id: string,
  payout: { paid: true; paid_at: string; note: string | null } | { paid: false }
): Promise<void> {
  const patch = payout.paid
    ? { payout_status: "paid", payout_paid_at: payout.paid_at, payout_note: payout.note }
    : { payout_status: "unpaid", payout_paid_at: null, payout_note: null };
  const { error } = await supabase
    .from("referral_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Supabase-backed store for the booking report handler. */
export const supabaseBookingReportStore: BookingReportStore = {
  async findHotelId(slug) {
    const { data, error } = await supabase
      .from("hotels")
      .select("id")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  },

  async findPartnerByRefCode(hotelId, refCode): Promise<PartnerRule | null> {
    const { data, error } = await supabase
      .from("influencers")
      .select("id, commission_kind, commission_value, commission_currency")
      .eq("hotel_id", hotelId)
      .eq("slug", refCode.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async recordEvent(hotelId, bookingRef, event: BookingEvent, payload) {
    const { error } = await supabase
      .from("referral_booking_events")
      .insert({ hotel_id: hotelId, booking_ref: bookingRef, event, payload });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: already recorded
    throw error;
  },

  async forgetEvent(hotelId, bookingRef, event) {
    const { error } = await supabase
      .from("referral_booking_events")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("booking_ref", bookingRef)
      .eq("event", event);
    if (error) throw error;
  },

  async getBooking(hotelId, bookingRef) {
    const { data, error } = await supabase
      .from("referral_bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("booking_ref", bookingRef)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async insertBooking(row: NewBookingRow) {
    const { error } = await supabase.from("referral_bookings").insert(row);
    if (error) throw error;
  },

  async updateBooking(id, patch: BookingPatch) {
    const { error } = await supabase
      .from("referral_bookings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

/** Supabase-backed store for the admin partner API (bulk upsert + list). */
export const supabasePartnerAdminStore: PartnerAdminStore = {
  findHotelId: supabaseBookingReportStore.findHotelId,

  async listPartners(hotelId) {
    return listInfluencersForHotel(hotelId);
  },

  async findByEmail(email) {
    const { data, error } = await supabase
      .from("influencers")
      .select("id, hotel_id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async insertPartner(row) {
    const { data, error } = await supabase.from("influencers").insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async updatePartner(id, patch) {
    const { data, error } = await supabase.from("influencers").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },

  async listBookings(hotelId) {
    return listBookingsForHotel(hotelId);
  },
};
