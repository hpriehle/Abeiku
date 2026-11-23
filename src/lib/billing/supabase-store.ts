// Supabase store for billing. Needs docs/l2-signup/billing.sql; before it runs, reads that
// select billing columns fail with a missing-column error (callers treat the hotel as legacy).
// past_due_since comes from docs/go-live-l3-billing.sql: until that runs, reads and writes
// fall back to the columns without it, so billing keeps working (no grace lock yet).
// suspended_at (docs/go-live-platform-actions.sql) falls back the same way.

import { supabase } from "@/lib/supabase/client";
import type { BillingStore, BillingHotel, BillingPatch } from "./store";
import { isMissingColumnError } from "./store";

const BASE_COLUMNS =
  "id, name, slug, contact_email, billing_exempt, billing_status, billing_provider, billing_currency, billing_tier, " +
  "room_count, trial_ends_at, current_period_end, billing_customer_id, billing_subscription_id, billing_setup_ref, billing_updated_at";
/** Tried in order: a later set drops a column whose SQL file may not have run yet. */
const COLUMN_SETS = [`${BASE_COLUMNS}, past_due_since, suspended_at`, `${BASE_COLUMNS}, past_due_since`, BASE_COLUMNS];
const OPTIONAL_COLUMN = /past_due_since|suspended_at/;

/** Billing emails share billing_events (primary key provider + event_id) under this provider. */
const EMAIL_PROVIDER = "email";

type Query<T> = (columns: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>;

/** Runs the select with the optional columns, dropping them if they are not there yet. */
async function selectWithFallback<T>(q: Query<T>): Promise<T | null> {
  for (const [i, columns] of COLUMN_SETS.entries()) {
    const { data, error } = await q(columns);
    if (!error) return data;
    if (i === COLUMN_SETS.length - 1 || !isMissingColumnError(error) || !OPTIONAL_COLUMN.test(error.message)) throw error;
  }
  return null;
}

export const supabaseBillingStore: BillingStore = {
  async getHotel(id) {
    const data = await selectWithFallback((c) => supabase.from("hotels").select(c).eq("id", id).maybeSingle());
    return (data as unknown as BillingHotel) ?? null;
  },

  async update(id, patch) {
    const run = (p: BillingPatch) =>
      supabase.from("hotels").update({ ...p, billing_updated_at: new Date().toISOString() }).eq("id", id);
    let { error } = await run(patch);
    if (error && "past_due_since" in patch && isMissingColumnError(error) && /past_due_since/.test(error.message)) {
      const rest = { ...patch };
      delete rest.past_due_since;
      ({ error } = await run(rest));
    }
    if (error) throw error;
  },

  async findBySubscription(provider, subscriptionId) {
    const data = await selectWithFallback((c) =>
      supabase
        .from("hotels")
        .select(c)
        .eq("billing_provider", provider)
        .eq("billing_subscription_id", subscriptionId)
        .maybeSingle()
    );
    return (data as unknown as BillingHotel) ?? null;
  },

  async findByCustomer(provider, customerId) {
    const data = await selectWithFallback((c) =>
      supabase.from("hotels").select(c).eq("billing_provider", provider).eq("billing_customer_id", customerId).limit(1)
    );
    return (((data as unknown[]) ?? [])[0] as BillingHotel) ?? null;
  },

  async firstDelivery(provider, eventId) {
    const { error } = await supabase.from("billing_events").insert({ provider, event_id: eventId });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: seen before
    throw error;
  },

  async forgetDelivery(provider, eventId) {
    const { error } = await supabase.from("billing_events").delete().eq("provider", provider).eq("event_id", eventId);
    if (error) console.error("[billing] could not forget delivery", provider, eventId, error.message);
  },

  async claimEmail(key) {
    const { error } = await supabase.from("billing_events").insert({ provider: EMAIL_PROVIDER, event_id: key });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw error;
  },

  async releaseEmail(key) {
    const { error } = await supabase.from("billing_events").delete().eq("provider", EMAIL_PROVIDER).eq("event_id", key);
    if (error) console.error("[billing] could not release email marker", key, error.message);
  },

  async ownerEmail(hotelId) {
    const { data } = await supabase
      .from("admin_users")
      .select("email")
      .eq("hotel_id", hotelId)
      .neq("role", "platform_admin")
      .order("created_at", { ascending: true })
      .limit(1);
    const login = (data?.[0] as { email?: string } | undefined)?.email;
    if (login) return login;
    const h = await this.getHotel(hotelId);
    return h?.contact_email ?? null;
  },

  async listForDailyCheck() {
    const data = await selectWithFallback((c) =>
      supabase.from("hotels").select(c).in("billing_status", ["trialing", "past_due", "canceled"])
    );
    return (data as unknown as BillingHotel[]) ?? [];
  },
};

/** Every hotel's billing state for the platform admin. Null if the billing columns are missing. */
export async function listHotelBilling(): Promise<BillingHotel[] | null> {
  try {
    const data = await selectWithFallback((c) => supabase.from("hotels").select(c).order("created_at", { ascending: false }));
    return (data as unknown as BillingHotel[]) ?? [];
  } catch (err) {
    console.error("[billing] list failed (run docs/l2-signup/billing.sql?):", (err as Error).message);
    return null;
  }
}
