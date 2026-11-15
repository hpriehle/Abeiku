// Supabase store for billing. Needs docs/l2-signup/billing.sql; before it runs, reads that
// select billing columns fail with a missing-column error (callers treat the hotel as legacy).

import { supabase } from "@/lib/supabase/client";
import type { BillingStore, BillingHotel } from "./store";

const COLUMNS =
  "id, name, slug, contact_email, billing_exempt, billing_status, billing_provider, billing_currency, billing_tier, " +
  "room_count, trial_ends_at, current_period_end, billing_customer_id, billing_subscription_id, billing_setup_ref, billing_updated_at";

export const supabaseBillingStore: BillingStore = {
  async getHotel(id) {
    const { data, error } = await supabase.from("hotels").select(COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as unknown as BillingHotel) ?? null;
  },

  async update(id, patch) {
    const { error } = await supabase
      .from("hotels")
      .update({ ...patch, billing_updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async findBySubscription(provider, subscriptionId) {
    const { data, error } = await supabase
      .from("hotels")
      .select(COLUMNS)
      .eq("billing_provider", provider)
      .eq("billing_subscription_id", subscriptionId)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as BillingHotel) ?? null;
  },

  async findByCustomer(provider, customerId) {
    const { data, error } = await supabase
      .from("hotels")
      .select(COLUMNS)
      .eq("billing_provider", provider)
      .eq("billing_customer_id", customerId)
      .limit(1);
    if (error) throw error;
    return ((data ?? [])[0] as unknown as BillingHotel) ?? null;
  },

  async firstDelivery(provider, eventId) {
    const { error } = await supabase.from("billing_events").insert({ provider, event_id: eventId });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: seen before
    throw error;
  },
};

/** Every hotel's billing state for the platform admin. Null if the billing columns are missing. */
export async function listHotelBilling(): Promise<BillingHotel[] | null> {
  const { data, error } = await supabase.from("hotels").select(COLUMNS).order("created_at", { ascending: false });
  if (error) {
    console.error("[billing] list failed (run docs/l2-signup/billing.sql?):", error.message);
    return null;
  }
  return (data as unknown as BillingHotel[]) ?? [];
}
