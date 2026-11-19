// Real billing dependencies for routes and pages.

import { SITE_URL } from "@/lib/site";
import { sendEmail } from "@/lib/notifications/email";
import { opsAlertEmail } from "@/lib/ops/alerts";
import type { BillingDeps } from "./flow";
import { paystackBillingApi } from "./paystack-api";
import { planIdsFromEnv } from "./plans";
import { stripeBillingApi } from "./stripe-api";
import { supabaseBillingStore } from "./supabase-store";
import { billingView, type BillingView } from "./access";
import { isMissingColumnError } from "./store";

export function billingDeps(): BillingDeps {
  return {
    store: supabaseBillingStore,
    paystack: paystackBillingApi,
    stripe: stripeBillingApi,
    planIds: planIdsFromEnv(),
    appUrl: SITE_URL,
    cardCheckPesewas: 100, // GH₵1: the sign-up page says so
    send: sendEmail,
    platformEmail: opsAlertEmail(),
  };
}

export { signupOpen } from "./flags";

/**
 * Billing view of a hotel for pages and login. Never throws: if the billing columns are missing
 * (SQL not run) or the read fails, the hotel is treated as legacy with full access, so Aracuya
 * and every existing hotel keep working.
 */
export async function loadBillingView(hotelId: string): Promise<BillingView> {
  try {
    const hotel = await supabaseBillingStore.getHotel(hotelId);
    return billingView(hotel ?? {});
  } catch (err) {
    if (!isMissingColumnError(err)) console.error("[billing] read failed, treating as legacy:", err);
    return billingView({});
  }
}
