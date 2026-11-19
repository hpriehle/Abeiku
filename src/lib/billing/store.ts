// Where billing state lives. The interface lets tests use an in-memory store;
// supabaseBillingStore is the real one (hotels columns from docs/l2-signup/billing.sql).

import type { HotelBilling } from "./access";
import type { BillingProvider } from "./plans";

export interface BillingHotel extends HotelBilling {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
}

export type BillingPatch = Partial<Omit<BillingHotel, "id" | "name" | "slug" | "contact_email" | "billing_exempt">>;

export interface BillingStore {
  getHotel(id: string): Promise<BillingHotel | null>;
  update(id: string, patch: BillingPatch): Promise<void>;
  findBySubscription(provider: BillingProvider, subscriptionId: string): Promise<BillingHotel | null>;
  findByCustomer(provider: BillingProvider, customerId: string): Promise<BillingHotel | null>;
  /** true the first time an event id is seen; false for a repeat delivery. */
  firstDelivery(provider: BillingProvider, eventId: string): Promise<boolean>;
  /** Billing emails: true the first time `key` is claimed (then send); false if already sent. */
  claimEmail(key: string): Promise<boolean>;
  /** Undo a claim when the send failed, so the next run tries again. */
  releaseEmail(key: string): Promise<void>;
  /** The owner's login email (admin_users), else the hotel's contact email. */
  ownerEmail(hotelId: string): Promise<string | null>;
  /** Hotels the daily billing check looks at: trialing, past_due or canceled. */
  listForDailyCheck(): Promise<BillingHotel[]>;
}

/** True when an error means the billing columns/table are not there yet (SQL not run). */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  // 42703 undefined_column, 42P01 undefined_table, PGRST204/PGRST205 schema cache misses.
  if (e.code && ["42703", "42P01", "PGRST204", "PGRST205"].includes(e.code)) return true;
  return /column .* does not exist|could not find the .* column|relation .* does not exist|could not find the table/i.test(e.message ?? "");
}
