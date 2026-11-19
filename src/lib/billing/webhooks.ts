// Billing webhooks: signature checks and what each event does to the hotel's billing state.
//
// Paystack shares /api/paystack/webhook with guest booking payments. isPaystackBillingEvent()
// picks out only the subscription events (and the card check); everything else goes on to the
// existing guest-payment code unchanged.

import crypto from "crypto";
import { tierForPlanId, type PlanIds } from "./plans";
import { CARD_CHECK_PURPOSE, patchFromStripe, type BillingDeps } from "./flow";
import { toStripeSubscription } from "./stripe-api";
import type { BillingPatch } from "./store";
import { formatMinor } from "./emails";
import { applyBillingPatch, sendPaymentReceived, sendTrialEnding } from "./notices";

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Paystack: x-paystack-signature = HMAC-SHA512 of the raw body with the secret key. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return safeEqualHex(hash, signature);
}

/**
 * Stripe: Stripe-Signature = "t=<unix>,v1=<hex>[,v1=...]", v1 = HMAC-SHA256 of "<t>.<raw body>"
 * with the endpoint's whsec_ secret. Rejects timestamps more than `toleranceSec` away.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300
): boolean {
  if (!header || !secret) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (t === null || !Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => safeEqualHex(expected, s));
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

const PAYSTACK_SUBSCRIPTION_EVENTS = new Set([
  "subscription.create",
  "subscription.disable",
  "subscription.not_renew",
  "invoice.create",
  "invoice.update",
  "invoice.payment_failed",
]);

/** Is this Paystack event about Abeiku billing (not a guest booking payment)? */
export function isPaystackBillingEvent(event: string, data: Raw, planIds: PlanIds): boolean {
  if (PAYSTACK_SUBSCRIPTION_EVENTS.has(event)) return true;
  if (event === "charge.success" || event === "charge.failed") {
    if (obj(data.metadata).purpose === CARD_CHECK_PURPOSE) return true;
    const planCode = str(obj(data.plan).plan_code) ?? str(data.plan);
    return tierForPlanId(planIds, "paystack", planCode) !== null;
  }
  return false;
}

export type WebhookOutcome = { handled: boolean; hotelId?: string; note: string };

/** Paystack billing event → hotel state. Call only after the signature check. */
export async function handlePaystackBillingEvent(deps: BillingDeps, event: string, data: Raw): Promise<WebhookOutcome> {
  // Card check: finished when the owner comes back (/signup/done) or next opens the card step.
  if (obj(data.metadata).purpose === CARD_CHECK_PURPOSE) return { handled: false, note: "card check, finished on return" };

  const sub = obj(data.subscription);
  const subCode = str(data.subscription_code) ?? str(sub.subscription_code);
  const customerCode = str(obj(data.customer).customer_code);
  const planCode = str(obj(data.plan).plan_code) ?? str(obj(sub.plan).plan_code);

  // Plan subscription and invoice events carry the subscription code; a renewal charge only the customer.
  let hotel = subCode ? await deps.store.findBySubscription("paystack", subCode) : null;
  if (!hotel && !subCode && customerCode && tierForPlanId(deps.planIds, "paystack", planCode)) {
    hotel = await deps.store.findByCustomer("paystack", customerCode);
  }
  if (!hotel) return { handled: false, note: `no hotel for ${subCode ?? customerCode ?? "event"}` };

  const eventId = `${event}:${str(data.id) ?? String(data.id ?? "")}:${subCode ?? ""}:${str(data.invoice_code) ?? str(data.reference) ?? ""}:${str(data.status) ?? ""}`;
  if (!(await deps.store.firstDelivery("paystack", eventId))) return { handled: false, hotelId: hotel.id, note: "repeat delivery" };

  const nextDate = str(data.next_payment_date) ?? str(sub.next_payment_date);
  let patch: BillingPatch | null = null;

  switch (event) {
    case "subscription.create":
      // Trial started (subscription created with a later start_date). Status is set on return.
      patch = nextDate && hotel.billing_status === "trialing" ? { current_period_end: nextDate } : null;
      break;
    case "charge.success":
      patch = { billing_status: "active" };
      break;
    case "invoice.update":
      if (data.paid === true || data.status === "success") patch = { billing_status: "active", ...(nextDate ? { current_period_end: nextDate } : {}) };
      break;
    case "charge.failed":
    case "invoice.payment_failed":
      patch = { billing_status: "past_due" };
      break;
    case "subscription.not_renew":
    case "subscription.disable":
      if (hotel.billing_status !== "canceled") {
        patch = { billing_status: "canceled", current_period_end: nextDate ?? hotel.current_period_end ?? hotel.trial_ends_at ?? null };
      }
      break;
    default:
      patch = null; // invoice.create: nothing to change
  }

  if (!patch) return { handled: false, hotelId: hotel.id, note: `${event}: no change` };
  // A charge after a cancel (e.g. late renewal) must not bring a cancelled hotel back silently.
  if (hotel.billing_status === "canceled" && patch.billing_status && patch.billing_status !== "canceled") {
    return { handled: false, hotelId: hotel.id, note: `${event}: hotel cancelled, ignored` };
  }
  await applyBillingPatch(deps, hotel, patch);
  if (event === "charge.success") {
    const amount = typeof data.amount === "number" ? formatMinor(data.amount, str(data.currency) ?? "GHS") : null;
    await sendPaymentReceived(deps, { ...hotel, ...patch }, `paystack:${str(data.reference) ?? eventId}`, amount, null);
  }
  return { handled: true, hotelId: hotel.id, note: `${event} → ${patch.billing_status ?? "updated"}` };
}

/** Stripe event → hotel state. Call only after the signature check. */
export async function handleStripeEvent(deps: BillingDeps, evt: { id: string; type: string; data: { object: Raw } }): Promise<WebhookOutcome> {
  const o = evt.data.object;
  let hotel = null;
  let patch: BillingPatch | null = null;

  switch (evt.type) {
    case "checkout.session.completed": {
      const hotelId = str(o.client_reference_id) ?? str(obj(o.metadata).hotel_id);
      const subId = str(o.subscription) ?? str(obj(o.subscription).id);
      if (!hotelId || !subId || o.mode !== "subscription") return { handled: false, note: "not a billing checkout" };
      hotel = await deps.store.getHotel(hotelId);
      if (!hotel) return { handled: false, note: `no hotel ${hotelId}` };
      if (hotel.billing_status !== "pending_card") return { handled: false, hotelId, note: "already set up" };
      const sub = await deps.stripe.retrieveSubscription(subId);
      patch = { ...patchFromStripe(sub, deps), billing_setup_ref: null };
      if (!patch.billing_status) patch.billing_status = "trialing";
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = toStripeSubscription(o);
      hotel = await deps.store.findBySubscription("stripe", sub.id);
      if (!hotel) return { handled: false, note: `no hotel for ${sub.id}` };
      patch = patchFromStripe(sub, deps);
      if (evt.type === "customer.subscription.deleted") patch.billing_status = "canceled";
      // When we cancel in the trial, keep access to the end of the trial.
      if (patch.billing_status === "canceled" && hotel.trial_ends_at && evt.type === "customer.subscription.deleted") {
        const end = patch.current_period_end ?? null;
        if (!end || Date.parse(end) < Date.parse(hotel.trial_ends_at)) patch.current_period_end = hotel.trial_ends_at;
      }
      delete patch.billing_customer_id;
      break;
    }
    case "customer.subscription.trial_will_end": {
      // Stripe sends this 3 days before the trial ends: the same once-only reminder as the daily check.
      const sub = toStripeSubscription(o);
      hotel = await deps.store.findBySubscription("stripe", sub.id);
      if (!hotel) return { handled: false, note: `no hotel for ${sub.id}` };
      await sendTrialEnding(deps, hotel);
      return { handled: true, hotelId: hotel.id, note: "trial_will_end: reminder" };
    }
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const subId =
        str(o.subscription) ??
        str(obj(o.subscription).id) ??
        str(obj(obj(obj(o.parent).subscription_details)).subscription);
      if (!subId) return { handled: false, note: "invoice without subscription" };
      hotel = await deps.store.findBySubscription("stripe", subId);
      if (!hotel) return { handled: false, note: `no hotel for ${subId}` };
      if (evt.type === "invoice.payment_failed") patch = { billing_status: "past_due" };
      else if (Number(o.amount_paid ?? 0) > 0) patch = { billing_status: "active" };
      // The $0 trial invoice: no change.
      break;
    }
    default:
      return { handled: false, note: `${evt.type}: ignored` };
  }

  if (!patch || !hotel) return { handled: false, hotelId: hotel?.id, note: `${evt.type}: no change` };
  if (!(await deps.store.firstDelivery("stripe", evt.id))) return { handled: false, hotelId: hotel.id, note: "repeat delivery" };
  if (hotel.billing_status === "canceled" && patch.billing_status && patch.billing_status !== "canceled") {
    return { handled: false, hotelId: hotel.id, note: `${evt.type}: hotel cancelled, ignored` };
  }
  await applyBillingPatch(deps, hotel, patch);
  if ((evt.type === "invoice.paid" || evt.type === "invoice.payment_succeeded") && Number(o.amount_paid ?? 0) > 0) {
    // invoice.paid and invoice.payment_succeeded both come for one invoice: key on the invoice.
    const amount = formatMinor(Number(o.amount_paid), str(o.currency) ?? "usd");
    await sendPaymentReceived(deps, { ...hotel, ...patch }, `stripe:${str(o.id) ?? evt.id}`, amount, null);
  }
  return { handled: true, hotelId: hotel.id, note: `${evt.type} → ${patch.billing_status ?? "updated"}` };
}
