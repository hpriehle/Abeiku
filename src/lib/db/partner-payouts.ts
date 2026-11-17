// Supabase storage for hotel-recorded partner payouts (docs/go-live-p2-signup-payouts.sql).
// Before that SQL runs: ready() is false, lists are empty.

import { supabase } from "@/lib/supabase/client";
import { adminPayoutView, type PayoutRow, type PayoutStore } from "@/lib/partner/payouts";
import { isMissingSchema } from "./partner-accounts";

const COLUMNS = "id, hotel_id, influencer_id, amount, currency, paid_on, method, reference, created_at";

let readyCache: { value: boolean; at: number } | null = null;
const NOT_READY_TTL_MS = 60_000;

async function payoutsReady(): Promise<boolean> {
  if (readyCache && (readyCache.value || Date.now() - readyCache.at < NOT_READY_TTL_MS)) return readyCache.value;
  const [table, column] = await Promise.all([
    supabase.from("partner_payouts").select("id").limit(1),
    supabase.from("referral_bookings").select("payout_id").limit(1),
  ]);
  for (const r of [table, column]) {
    if (r.error && !isMissingSchema(r.error)) throw r.error;
  }
  const value = !table.error && !column.error;
  readyCache = { value, at: Date.now() };
  return value;
}

async function list(column: "influencer_id" | "hotel_id", id: string): Promise<PayoutRow[]> {
  const { data, error } = await supabase
    .from("partner_payouts")
    .select(COLUMNS)
    .eq(column, id)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
  return (data ?? []) as PayoutRow[];
}

export const supabasePayoutStore: PayoutStore = {
  ready: payoutsReady,

  async insert(row) {
    const { data, error } = await supabase.from("partner_payouts").insert(row).select(COLUMNS).single();
    if (error) throw error;
    return data as PayoutRow;
  },

  async remove(id) {
    const { error } = await supabase.from("partner_payouts").delete().eq("id", id);
    if (error) throw error;
  },

  async markBookingsPaid(influencerId, bookingIds, payout) {
    const { data, error } = await supabase
      .from("referral_bookings")
      .update({
        payout_status: "paid",
        payout_paid_at: payout.paid_on,
        payout_note: payout.note,
        payout_id: payout.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", bookingIds)
      .eq("influencer_id", influencerId)
      .eq("payout_status", "unpaid")
      .select("id");
    if (error) throw error;
    return (data ?? []).length;
  },

  listForPartner: (influencerId) => list("influencer_id", influencerId),
  listForHotel: (hotelId) => list("hotel_id", hotelId),
};

/** The hotel's recorded payouts for the admin Partners page, with partner names. */
export async function listAdminPayouts(hotelId: string, partners: { id: string; name: string }[]) {
  const names = new Map(partners.map((p) => [p.id, p.name]));
  return (await supabasePayoutStore.listForHotel(hotelId)).map((p) =>
    adminPayoutView(p, names.get(p.influencer_id) ?? null)
  );
}
