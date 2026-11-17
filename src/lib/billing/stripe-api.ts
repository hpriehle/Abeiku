// Real Stripe calls for billing (https://docs.stripe.com/api), plain fetch, no SDK.
// Uses STRIPE_SECRET_KEY (Abeiku's own account, not a hotel's key); refuses a live key
// unless BILLING_LIVE=true. Not used by tests.

import { LEGAL_LINE } from "./emails";
import { assertKeyAllowed, type StripeBillingApi, type StripeCheckoutSession, type StripeSubscription } from "./providers";

const BASE = "https://api.stripe.com/v1";

type Raw = Record<string, unknown>;

async function call(method: "GET" | "POST" | "DELETE", path: string, form?: Record<string, string>): Promise<Raw> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  assertKeyAllowed(key, "Stripe");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok) {
    const msg = (json.error as Raw | undefined)?.message;
    throw new Error(`Stripe ${path}: ${res.status} ${typeof msg === "string" ? msg : ""}`.trim());
  }
  return json;
}

const num = (v: unknown) => (typeof v === "number" ? v : null);
const idOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? String((v as Raw).id ?? "") || null : null);

/** Works with old API versions (period end on the subscription) and new ones (on the item). */
export function toStripeSubscription(d: Raw): StripeSubscription {
  const items = ((d.items as Raw | undefined)?.data as Raw[] | undefined) ?? [];
  const first = items[0];
  return {
    id: String(d.id),
    status: String(d.status ?? ""),
    customer: idOf(d.customer) ?? "",
    trial_end: num(d.trial_end),
    current_period_end: num(d.current_period_end) ?? num(first?.current_period_end),
    cancel_at_period_end: d.cancel_at_period_end === true,
    cancel_at: num(d.cancel_at),
    item: first ? { id: String(first.id), price: idOf(first.price) ?? "" } : null,
    metadata: (d.metadata as Record<string, string>) ?? {},
  };
}

export function toCheckoutSession(d: Raw): StripeCheckoutSession {
  return {
    id: String(d.id),
    status: typeof d.status === "string" ? d.status : null,
    mode: String(d.mode ?? ""),
    client_reference_id: typeof d.client_reference_id === "string" ? d.client_reference_id : null,
    customer: idOf(d.customer),
    subscription: idOf(d.subscription),
    metadata: (d.metadata as Record<string, string>) ?? {},
  };
}

/**
 * The Checkout form. Branding: Checkout in subscription mode has no statement-descriptor
 * parameter (that is set on the product or the account in the dashboard, see
 * docs/go-live-billing-dashboard.md), so the API side names Abeiku where it can: the
 * subscription description (shown in the Billing Portal), the invoice footer, and the text
 * under the pay button. trial_period_days must be at least 1, so 0 (restart) leaves it out.
 */
export function checkoutForm(input: Parameters<StripeBillingApi["createCheckoutSession"]>[0]): Record<string, string> {
  const { price, hotelId, email, trialDays, successUrl, cancelUrl } = input;
  return {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    ...(trialDays > 0 ? { "subscription_data[trial_period_days]": String(trialDays) } : {}),
    "subscription_data[description]": "Abeiku monthly plan",
    "subscription_data[invoice_settings][footer]": LEGAL_LINE,
    "subscription_data[metadata][hotel_id]": hotelId,
    "custom_text[submit][message]": `${LEGAL_LINE}. ${trialDays > 0 ? `Free for ${trialDays} days, then charged monthly.` : "Charged now, then monthly."} Cancel any time.`,
    payment_method_collection: "always",
    client_reference_id: hotelId,
    customer_email: email,
    "metadata[hotel_id]": hotelId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

export const stripeBillingApi: StripeBillingApi = {
  async createCheckoutSession(input) {
    const d = await call("POST", "/checkout/sessions", checkoutForm(input));
    return { id: String(d.id), url: String(d.url) };
  },

  async createPortalSession(customerId, returnUrl) {
    const d = await call("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
    if (typeof d.url !== "string") throw new Error("Stripe portal session: no url");
    return d.url;
  },

  async retrieveCheckoutSession(id) {
    return toCheckoutSession(await call("GET", `/checkout/sessions/${encodeURIComponent(id)}`));
  },

  async retrieveSubscription(id) {
    return toStripeSubscription(await call("GET", `/subscriptions/${encodeURIComponent(id)}`));
  },

  async cancelSubscription(id, atPeriodEnd) {
    const d = atPeriodEnd
      ? await call("POST", `/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: "true" })
      : await call("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
    return toStripeSubscription(d);
  },

  async changePrice(subscriptionId, itemId, price) {
    const d = await call("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      "items[0][id]": itemId,
      "items[0][price]": price,
      proration_behavior: "none",
    });
    return toStripeSubscription(d);
  },
};
